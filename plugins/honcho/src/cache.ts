import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

const CACHE_DIR = join(homedir(), ".honcho");
const CONTEXT_CACHE_FILE = join(CACHE_DIR, "context-cache.json");

// Ensure cache directory exists
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// ============================================
// Context Cache - prompt counter for the one-off banners
// ============================================

interface ContextCache {
  messageCount?: number; // Prompts since SessionStart
}

// Known keys in ContextCache — anything else is a ghost from older versions
// (e.g. the claudeContext/summaries caches from before recall moved to chat)
const CONTEXT_CACHE_KNOWN_KEYS = new Set(["messageCount"]);

export function loadContextCache(): ContextCache {
  ensureCacheDir();
  if (!existsSync(CONTEXT_CACHE_FILE)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(CONTEXT_CACHE_FILE, "utf-8"));
    // Strip ghost keys left by older plugin versions (e.g. "aiContext")
    let cleaned = false;
    for (const key of Object.keys(raw)) {
      if (!CONTEXT_CACHE_KNOWN_KEYS.has(key)) {
        delete raw[key];
        cleaned = true;
      }
    }
    if (cleaned) {
      writeFileSync(CONTEXT_CACHE_FILE, JSON.stringify(raw, null, 2));
    }
    return raw;
  } catch {
    return {};
  }
}

export function saveContextCache(cache: ContextCache): void {
  ensureCacheDir();
  writeFileSync(CONTEXT_CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function incrementMessageCount(): number {
  const cache = loadContextCache();
  cache.messageCount = (cache.messageCount || 0) + 1;
  saveContextCache(cache);
  return cache.messageCount;
}

export function getMessageCount(): number {
  const cache = loadContextCache();
  return cache.messageCount || 0;
}

export function resetMessageCount(): void {
  const cache = loadContextCache();
  cache.messageCount = 0;
  saveContextCache(cache);
}

// ============================================
// Git State Cache - track git state per directory
// ============================================

const GIT_STATE_FILE = join(CACHE_DIR, "git-state.json");

export interface GitState {
  branch: string;
  commit: string; // Short SHA
  commitMessage: string;
  isDirty: boolean;
  dirtyFiles: string[];
  timestamp: string;
}

interface GitStateCache {
  [cwd: string]: GitState;
}

export function loadGitStateCache(): GitStateCache {
  ensureCacheDir();
  if (!existsSync(GIT_STATE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(GIT_STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveGitStateCache(cache: GitStateCache): void {
  ensureCacheDir();
  writeFileSync(GIT_STATE_FILE, JSON.stringify(cache, null, 2));
}

export function getCachedGitState(cwd: string): GitState | null {
  const cache = loadGitStateCache();
  return cache[cwd] || null;
}

export function setCachedGitState(cwd: string, state: GitState): void {
  const cache = loadGitStateCache();
  cache[cwd] = state;
  saveGitStateCache(cache);
}

export interface GitFeatureContext {
  type: "feature" | "fix" | "refactor" | "docs" | "test" | "chore" | "unknown";
  description: string;
  keywords: string[];
  areas: string[]; // e.g., ["api", "auth", "ui"]
  confidence: "high" | "medium" | "low";
}

export interface GitStateChange {
  type: "branch_switch" | "new_commits" | "files_changed" | "initial";
  description: string;
  from?: string;
  to?: string;
}

export function detectGitChanges(previous: GitState | null, current: GitState): GitStateChange[] {
  const changes: GitStateChange[] = [];

  if (!previous) {
    changes.push({
      type: "initial",
      description: `Session started on branch '${current.branch}' at ${current.commit}`,
    });
    return changes;
  }

  // Branch switch
  if (previous.branch !== current.branch) {
    changes.push({
      type: "branch_switch",
      description: `Branch switched from '${previous.branch}' to '${current.branch}'`,
      from: previous.branch,
      to: current.branch,
    });
  }

  // New commits (different SHA on same branch, or any commit change)
  if (previous.commit !== current.commit) {
    changes.push({
      type: "new_commits",
      description: `New commit: ${current.commit} - ${current.commitMessage}`,
      from: previous.commit,
      to: current.commit,
    });
  }

  // Dirty state changed
  if (!previous.isDirty && current.isDirty) {
    changes.push({
      type: "files_changed",
      description: `Uncommitted changes detected: ${current.dirtyFiles.slice(0, 5).join(", ")}${current.dirtyFiles.length > 5 ? "..." : ""}`,
    });
  }

  return changes;
}

// ============================================
// Message Chunking - split large messages for API limits
// ============================================

// Under Honcho's 25k-char per-message cap, with headroom for the [Part i/N] prefix.
const MAX_MESSAGE_SIZE = 24000;

export function chunkContent(content: string, maxSize: number = MAX_MESSAGE_SIZE): string[] {
  if (content.length <= maxSize) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxSize) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline boundary
    let splitIndex = remaining.lastIndexOf('\n', maxSize);
    if (splitIndex <= 0 || splitIndex < maxSize * 0.25) {
      // No good newline boundary, split at space
      splitIndex = remaining.lastIndexOf(' ', maxSize);
    }
    if (splitIndex <= 0 || splitIndex < maxSize * 0.25) {
      // No good boundary, hard split
      splitIndex = maxSize;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  if (chunks.length > 1) {
    return chunks.map((chunk, i) => `[Part ${i + 1}/${chunks.length}] ${chunk}`);
  }

  return chunks;
}

export const HONCHO_MAX_BATCH = 100;

type SessionLike = { addMessages: (messages: any[]) => Promise<unknown> };

/**
 * Upload messages, split across calls of ≤100 to stay under Honcho's batch cap.
 *
 * When `resolveFallback` is given, a batch failure resolves an alternate session
 * once and retries only the failed batch (and any remaining ones) on it. This
 * lets callers front a fast noEnsure session and fall back to get-or-create
 * without ever replaying batches the first session already accepted.
 */
export async function addMessagesBatched(
  session: SessionLike,
  messages: any[],
  resolveFallback?: (error: unknown) => Promise<SessionLike>,
): Promise<void> {
  let active = session;
  let usedFallback = false;
  for (let i = 0; i < messages.length; i += HONCHO_MAX_BATCH) {
    const batch = messages.slice(i, i + HONCHO_MAX_BATCH);
    try {
      await active.addMessages(batch);
    } catch (e) {
      if (usedFallback || !resolveFallback) throw e;
      active = await resolveFallback(e);
      usedFallback = true;
      await active.addMessages(batch);
    }
  }
}
