import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { getContextRefreshConfig } from "./config.js";

const CACHE_DIR = join(homedir(), ".honcho");
const ID_CACHE_FILE = join(CACHE_DIR, "cache.json");
const CONTEXT_CACHE_FILE = join(CACHE_DIR, "context-cache.json");

// Ensure cache directory exists
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// ============================================
// ID Cache - workspace, session, peer IDs
// ============================================

interface IdCache {
  workspace?: { name: string; id: string };
  peers?: Record<string, string>; // peerName -> peerId
  sessions?: Record<string, { name: string; id: string; updatedAt: string; instanceId?: string }>; // cwd -> session info
  claudeInstanceId?: string; // DEPRECATED: use per-cwd instanceId in sessions map instead
}

export function loadIdCache(): IdCache {
  ensureCacheDir();
  if (!existsSync(ID_CACHE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(ID_CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveIdCache(cache: IdCache): void {
  ensureCacheDir();
  writeFileSync(ID_CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function getCachedWorkspaceId(workspaceName: string): string | null {
  const cache = loadIdCache();
  if (cache.workspace?.name === workspaceName) {
    return cache.workspace.id;
  }
  return null;
}

export function setCachedWorkspaceId(name: string, id: string): void {
  const cache = loadIdCache();
  cache.workspace = { name, id };
  saveIdCache(cache);
}

export function getCachedPeerId(peerName: string): string | null {
  const cache = loadIdCache();
  return cache.peers?.[peerName] || null;
}

export function setCachedPeerId(peerName: string, peerId: string): void {
  const cache = loadIdCache();
  if (!cache.peers) cache.peers = {};
  cache.peers[peerName] = peerId;
  saveIdCache(cache);
}

export function getCachedSessionId(cwd: string): string | null {
  const cache = loadIdCache();
  return cache.sessions?.[cwd]?.id || null;
}

export function setCachedSessionId(cwd: string, name: string, id: string, instanceId?: string): void {
  const cache = loadIdCache();
  if (!cache.sessions) cache.sessions = {};
  cache.sessions[cwd] = { name, id, updatedAt: new Date().toISOString(), instanceId };
  saveIdCache(cache);
}

/** Find the most recently active CWD from cached sessions (fallback for MCP servers without project dir) */
export function getLastActiveCwd(): string | null {
  const cache = loadIdCache();
  if (!cache.sessions) return null;
  let latest: { cwd: string; updatedAt: string } | null = null;
  for (const [cwd, entry] of Object.entries(cache.sessions)) {
    if (!latest || entry.updatedAt > latest.updatedAt) {
      latest = { cwd, updatedAt: entry.updatedAt };
    }
  }
  return latest?.cwd || null;
}

// Claude instance tracking for parallel session support
export function getClaudeInstanceId(): string | null {
  const cache = loadIdCache();
  return cache.claudeInstanceId || null;
}

export function setClaudeInstanceId(instanceId: string): void {
  const cache = loadIdCache();
  cache.claudeInstanceId = instanceId;
  saveIdCache(cache);
}

/** Get the instance ID stored for a specific cwd (scoped, no cross-session collision) */
export function getInstanceIdForCwd(cwd: string): string | null {
  const cache = loadIdCache();
  return cache.sessions?.[cwd]?.instanceId ?? null;
}

// ============================================
// Context Cache - user + claude context with TTL
// ============================================

interface ContextCache {
  userContext?: { data: any; fetchedAt: number };
  claudeContext?: { data: any; fetchedAt: number };
  summaries?: { data: any; fetchedAt: number };
  messageCount?: number; // Track messages since last refresh
}

// Now configurable via config.json, with defaults in getContextRefreshConfig()
function getContextTTL(): number {
  const config = getContextRefreshConfig();
  return (config.ttlSeconds ?? 300) * 1000; // Convert to ms
}

// Known keys in ContextCache — anything else is a ghost from older versions
const CONTEXT_CACHE_KNOWN_KEYS = new Set([
  "claudeContext", "summaries", "messageCount",
]);

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

export function getCachedClaudeContext(): any | null {
  const cache = loadContextCache();
  if (cache.claudeContext && Date.now() - cache.claudeContext.fetchedAt < getContextTTL()) {
    return cache.claudeContext.data;
  }
  return null;
}

export function setCachedClaudeContext(data: any): void {
  const cache = loadContextCache();
  cache.claudeContext = { data, fetchedAt: Date.now() };
  saveContextCache(cache);
}

// Track message count for threshold-based refresh
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

// ============================================
// Utility: Clear all caches (for debugging)
// ============================================

export function clearAllCaches(): void {
  ensureCacheDir();
  if (existsSync(ID_CACHE_FILE)) writeFileSync(ID_CACHE_FILE, "{}");
  if (existsSync(CONTEXT_CACHE_FILE)) writeFileSync(CONTEXT_CACHE_FILE, "{}");
  if (existsSync(GIT_STATE_FILE)) writeFileSync(GIT_STATE_FILE, "{}");
}

/** Clear only the ID cache (workspace, peer, session IDs) */
export function clearIdCache(): void {
  ensureCacheDir();
  writeFileSync(ID_CACHE_FILE, "{}");
}

/** Clear only peer IDs from the ID cache */
export function clearPeerCache(): void {
  const cache = loadIdCache();
  delete cache.peers;
  saveIdCache(cache);
}

/** Clear only userContext from the context cache */
export function clearUserContextOnly(): void {
  const cache = loadContextCache();
  delete cache.userContext;
  saveContextCache(cache);
}

/** Clear only claudeContext from the context cache */
export function clearClaudeContextOnly(): void {
  const cache = loadContextCache();
  delete cache.claudeContext;
  saveContextCache(cache);
}
