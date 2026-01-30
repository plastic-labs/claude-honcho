import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, getHonchoClientOptions } from "../config.js";
import { basename } from "path";
import {
  getCachedUserContext,
  isContextCacheStale,
  setCachedUserContext,
  queueMessage,
  incrementMessageCount,
  shouldRefreshKnowledgeGraph,
  markKnowledgeGraphRefreshed,
  getClaudeInstanceId,
} from "../cache.js";
import { logHook, logApiCall, logCache, setLogContext } from "../log.js";

interface HookInput {
  prompt?: string;
  cwd?: string;
  session_id?: string;
}

// Patterns to skip heavy context retrieval
const SKIP_CONTEXT_PATTERNS = [
  /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i,
  /^\//, // slash commands
];

/**
 * Extract meaningful topics from a prompt for semantic search
 * Instead of crude truncation (prompt.slice(0,500)), extract entities and terms
 */
function extractTopics(prompt: string): string[] {
  const topics: string[] = [];

  // Extract file paths (high signal)
  const filePaths = prompt.match(/[\w\-\/\.]+\.(ts|tsx|js|jsx|py|rs|go|md|json|yaml|yml|toml|sql)/gi) || [];
  topics.push(...filePaths.slice(0, 5));

  // Extract quoted strings (explicit references)
  const quoted = prompt.match(/"([^"]+)"/g)?.map(q => q.slice(1, -1)) || [];
  topics.push(...quoted.slice(0, 3));

  // Extract technical terms (common frameworks/tools)
  const techTerms = prompt.match(/\b(react|vue|svelte|angular|elysia|express|fastapi|django|flask|postgres|redis|docker|kubernetes|bun|node|deno|typescript|python|rust|go|graphql|rest|api|auth|oauth|jwt|stripe|webhook)\b/gi) || [];
  topics.push(...[...new Set(techTerms.map(t => t.toLowerCase()))].slice(0, 5));

  // Extract error patterns (debugging context)
  const errors = prompt.match(/error[:\s]+[\w\s]+|failed[:\s]+[\w\s]+|exception[:\s]+[\w\s]+/gi) || [];
  topics.push(...errors.slice(0, 2));

  // If we found meaningful topics, use them; otherwise fall back to first 200 chars
  if (topics.length > 0) {
    return [...new Set(topics)];
  }

  // Fallback: extract meaningful words (>3 chars, not common words)
  const commonWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'shall', 'need', 'want', 'like', 'just', 'also', 'more', 'some', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'all', 'each', 'every', 'both', 'few', 'most', 'other', 'into', 'over', 'such', 'only', 'same', 'than', 'very', 'your', 'make', 'take', 'come', 'give', 'look', 'think', 'know', 'see', 'time', 'year', 'people', 'way', 'day', 'man', 'woman', 'child', 'world', 'life', 'hand', 'part', 'place', 'case', 'week', 'company', 'system', 'program', 'question', 'work', 'government', 'number', 'night', 'point', 'home', 'water', 'room', 'mother', 'area', 'money', 'story', 'fact', 'month', 'lot', 'right', 'study', 'book', 'eye', 'job', 'word', 'business', 'issue', 'side', 'kind', 'head', 'house', 'service', 'friend', 'father', 'power', 'hour', 'game', 'line', 'end', 'member', 'law', 'car', 'city', 'community', 'name']);
  const words = prompt.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const meaningfulWords = words.filter(w => !commonWords.has(w));
  return [...new Set(meaningfulWords)].slice(0, 10);
}

function shouldSkipContextRetrieval(prompt: string): boolean {
  return SKIP_CONTEXT_PATTERNS.some((p) => p.test(prompt.trim()));
}

/**
 * Sort facts by recency (most recent first)
 * Falls back to original order if no timestamps available
 */
function sortByRecency<T extends { created_at?: string; metadata?: { created_at?: string } }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.created_at || a.metadata?.created_at || '';
    const bTime = b.created_at || b.metadata?.created_at || '';
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  return basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

export async function handleUserPrompt(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

  let hookInput: HookInput = {};
  try {
    const input = await Bun.stdin.text();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    process.exit(0);
  }

  const prompt = hookInput.prompt || "";
  const cwd = hookInput.cwd || process.cwd();

  // Set log context for this hook
  setLogContext(cwd, getSessionName(cwd));

  // Skip empty prompts
  if (!prompt.trim()) {
    process.exit(0);
  }

  logHook("user-prompt", `Prompt received (${prompt.length} chars)`);

  // CRITICAL: Save message to local queue FIRST (instant, ~1-3ms)
  // This survives ctrl+c, network failures, everything
  if (config.saveMessages !== false) {
    queueMessage(prompt, config.peerName, cwd);
  }

  // Start upload immediately (we'll await before exit)
  let uploadPromise: Promise<void> | null = null;
  if (config.saveMessages !== false) {
    uploadPromise = uploadMessageAsync(config, cwd, prompt);
  }

  // Track message count for threshold-based knowledge graph refresh
  const messageCount = incrementMessageCount();

  // For trivial prompts, skip heavy context retrieval but still upload
  if (shouldSkipContextRetrieval(prompt)) {
    logHook("user-prompt", "Skipping context (trivial prompt)");
    if (uploadPromise) await uploadPromise.catch((e) => logHook("user-prompt", `Upload failed: ${e}`, { error: String(e) }));
    process.exit(0);
  }

  // Determine if we should refresh: either cache is stale OR message threshold reached
  const forceRefresh = shouldRefreshKnowledgeGraph();
  const cachedContext = getCachedUserContext();
  const cacheIsStale = isContextCacheStale();

  if (cachedContext && !cacheIsStale && !forceRefresh) {
    // Use cached context - instant response
    logCache("hit", "userContext", "using cached");
    const contextParts = formatCachedContext(cachedContext, config.peerName);
    if (contextParts.length > 0) {
      outputContext(config.peerName, contextParts);
    }
    if (uploadPromise) await uploadPromise.catch((e) => logHook("user-prompt", `Upload failed: ${e}`, { error: String(e) }));
    process.exit(0);
  }

  // Fetch fresh context when:
  // 1. Cache is stale (>60s old), OR
  // 2. Message threshold reached (every 10 messages)
  logCache("miss", "userContext", forceRefresh ? "threshold refresh" : "stale cache");
  try {
    const contextParts = await fetchFreshContext(config, cwd, prompt);
    if (contextParts.length > 0) {
      outputContext(config.peerName, contextParts);
    }
    // Mark that we refreshed the knowledge graph
    if (forceRefresh) {
      markKnowledgeGraphRefreshed();
    }
  } catch {
    // Context fetch failed, continue without
  }

  // Ensure upload completes before exit
  if (uploadPromise) await uploadPromise.catch((e) => logHook("user-prompt", `Upload failed: ${e}`, { error: String(e) }));
  process.exit(0);
}

async function uploadMessageAsync(config: any, cwd: string, prompt: string): Promise<void> {
  logApiCall("session.addMessages", "POST", `user prompt (${prompt.length} chars)`);
  const honcho = new Honcho(getHonchoClientOptions(config));
  const sessionName = getSessionName(cwd);

  // Get session and peer using new fluent API
  const session = await honcho.session(sessionName);
  const userPeer = await honcho.peer(config.peerName);

  // Include instance_id and session_affinity in metadata
  const instanceId = getClaudeInstanceId();
  await session.addMessages([
    userPeer.message(prompt, {
      metadata: {
        instance_id: instanceId || undefined,
        session_affinity: sessionName,
      }
    }),
  ]);
}

function formatCachedContext(context: any, peerName: string): string[] {
  const parts: string[] = [];

  if (context?.representation?.explicit?.length) {
    // Sort by recency - recent facts are more relevant
    const sorted = sortByRecency(context.representation.explicit);
    const explicit = sorted
      .slice(0, 5)
      .map((e: any) => e.content || e)
      .join("; ");
    parts.push(`Relevant facts: ${explicit}`);
  }

  if (context?.representation?.deductive?.length) {
    // Sort by recency
    const sorted = sortByRecency(context.representation.deductive);
    const deductive = sorted
      .slice(0, 3)
      .map((d: any) => d.conclusion)
      .join("; ");
    parts.push(`Insights: ${deductive}`);
  }

  if (context?.peer_card?.length) {
    parts.push(`Profile: ${context.peer_card.join("; ")}`);
  }

  return parts;
}

async function fetchFreshContext(config: any, cwd: string, prompt: string): Promise<string[]> {
  const honcho = new Honcho(getHonchoClientOptions(config));
  const sessionName = getSessionName(cwd);

  // Get peer using new fluent API
  const session = await honcho.session(sessionName);

  const contextParts: string[] = [];

  // Only use context() here - it's free and returns pre-computed knowledge
  // Skip chat() - only use at session-start
  const startTime = Date.now();

  // Extract meaningful topics instead of crude truncation
  const topics = extractTopics(prompt);
  const searchQuery = topics.length > 0 ? topics.join(' ') : prompt.slice(0, 200);

  const contextResult = await session.context({
    searchQuery,
    representationOptions: {
      searchTopK: 10,
      searchMaxDistance: 0.7,
      maxConclusions: 15,
    },
  });

  logApiCall("session.context", "GET", `search query`, Date.now() - startTime, true);

  if (contextResult) {
    setCachedUserContext(contextResult); // Update cache
    logCache("write", "userContext", `${(contextResult as any).representation?.explicit?.length || 0} facts`);

    const rep = (contextResult as any).representation;
    if (rep?.explicit?.length) {
      // Sort by recency - recent facts are more relevant
      const sorted = sortByRecency(rep.explicit);
      const explicit = sorted
        .slice(0, 5)
        .map((e: any) => e.content || e)
        .join("; ");
      contextParts.push(`Relevant facts: ${explicit}`);
    }

    if (rep?.deductive?.length) {
      // Sort by recency
      const sorted = sortByRecency(rep.deductive);
      const deductive = sorted
        .slice(0, 3)
        .map((d: any) => d.conclusion)
        .join("; ");
      contextParts.push(`Insights: ${deductive}`);
    }

    const peerCard = (contextResult as any).peerCard || (contextResult as any).peer_card;
    if (peerCard?.length) {
      contextParts.push(`Profile: ${peerCard.join("; ")}`);
    }
  }

  return contextParts;
}

function outputContext(peerName: string, contextParts: string[]): void {
  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `[Honcho Memory for ${peerName}]: ${contextParts.join(" | ")}`,
    },
  };
  console.log(JSON.stringify(output));
}
