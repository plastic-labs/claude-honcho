import Honcho from "@honcho-ai/core";
import { loadConfig, getSessionForPath } from "../config.js";
import { basename } from "path";
import {
  getCachedWorkspaceId,
  setCachedWorkspaceId,
  getCachedPeerId,
  getCachedSessionId,
  setCachedSessionId,
  getCachedUserContext,
  isContextCacheStale,
  setCachedUserContext,
  queueMessage,
  incrementMessageCount,
  shouldRefreshKnowledgeGraph,
  markKnowledgeGraphRefreshed,
} from "../cache.js";

interface HookInput {
  prompt?: string;
  cwd?: string;
  session_id?: string;
}

// Patterns to skip heavy context retrieval
const SKIP_CONTEXT_PATTERNS = [
  /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i,
  /^\//, // slash commands
  /^.{1,19}$/, // very short (< 20 chars)
];

function shouldSkipContextRetrieval(prompt: string): boolean {
  return SKIP_CONTEXT_PATTERNS.some((p) => p.test(prompt.trim()));
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

  // Skip empty prompts
  if (!prompt.trim()) {
    process.exit(0);
  }

  // CRITICAL: Save message to local queue FIRST (instant, ~1-3ms)
  // This survives ctrl+c, network failures, everything
  if (config.saveMessages !== false) {
    queueMessage(prompt, config.peerName, cwd);
  }

  // Fire-and-forget: Upload to Honcho immediately for real-time processing
  // Honcho needs messages ASAP to process/compact before next session
  // Order in Honcho doesn't matter for knowledge extraction - it's the content that matters
  if (config.saveMessages !== false) {
    uploadMessageAsync(config, cwd, prompt).catch(() => {});
  }

  // Track message count for threshold-based knowledge graph refresh
  const messageCount = incrementMessageCount();

  // For trivial prompts, skip heavy context retrieval
  if (shouldSkipContextRetrieval(prompt)) {
    process.exit(0);
  }

  // Determine if we should refresh: either cache is stale OR message threshold reached
  const forceRefresh = shouldRefreshKnowledgeGraph();
  const cachedContext = getCachedUserContext();
  const cacheIsStale = isContextCacheStale();

  if (cachedContext && !cacheIsStale && !forceRefresh) {
    // Use cached context - instant response
    const contextParts = formatCachedContext(cachedContext, config.peerName);
    if (contextParts.length > 0) {
      outputContext(config.peerName, contextParts);
    }
    process.exit(0);
  }

  // Fetch fresh context when:
  // 1. Cache is stale (>60s old), OR
  // 2. Message threshold reached (every 10 messages)
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

  process.exit(0);
}

async function uploadMessageAsync(config: any, cwd: string, prompt: string): Promise<void> {
  const client = new Honcho({
    apiKey: config.apiKey,
    environment: "production",
  });

  // Try to use cached IDs for speed
  let workspaceId = getCachedWorkspaceId(config.workspace);
  let sessionId = getCachedSessionId(cwd);

  if (!workspaceId || !sessionId) {
    // No cache - need full setup and cache the results
    const workspace = await client.workspaces.getOrCreate({ id: config.workspace });
    workspaceId = workspace.id;
    setCachedWorkspaceId(config.workspace, workspaceId);

    const sessionName = getSessionName(cwd);
    const session = await client.workspaces.sessions.getOrCreate(workspaceId, {
      id: sessionName,
      metadata: { cwd },
    });
    sessionId = session.id;
    setCachedSessionId(cwd, sessionName, sessionId);
  }

  await client.workspaces.sessions.messages.create(workspaceId, sessionId, {
    messages: [{ content: prompt, peer_id: config.peerName }],
  });
}

function formatCachedContext(context: any, peerName: string): string[] {
  const parts: string[] = [];

  if (context?.representation?.explicit?.length) {
    const explicit = context.representation.explicit
      .slice(0, 5)
      .map((e: any) => e.content || e)
      .join("; ");
    parts.push(`Relevant facts: ${explicit}`);
  }

  if (context?.representation?.deductive?.length) {
    const deductive = context.representation.deductive
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
  const client = new Honcho({
    apiKey: config.apiKey,
    environment: "production",
  });

  // Try to use cached IDs
  let workspaceId = getCachedWorkspaceId(config.workspace);
  if (!workspaceId) {
    const workspace = await client.workspaces.getOrCreate({ id: config.workspace });
    workspaceId = workspace.id;
  }

  const userPeerId = getCachedPeerId(config.peerName);
  if (!userPeerId) {
    // Can't fetch context without peer ID
    return [];
  }

  const sessionName = getSessionName(cwd);
  let sessionId = getCachedSessionId(cwd);
  if (!sessionId) {
    const session = await client.workspaces.sessions.getOrCreate(workspaceId, { id: sessionName });
    sessionId = session.id;
  }

  const contextParts: string[] = [];

  // Only use getContext() here - it's free/cheap and returns pre-computed knowledge
  // Skip chat() ($0.03 per call) - only use at session-start
  const contextResult = await client.workspaces.peers.getContext(workspaceId, userPeerId, {
    search_query: prompt.slice(0, 500),
    search_top_k: 10,
    search_max_distance: 0.7,
    max_observations: 15,
    include_most_derived: true,
  });

  if (contextResult) {
    setCachedUserContext(contextResult); // Update cache

    if (contextResult.representation?.explicit?.length) {
      const explicit = contextResult.representation.explicit
        .slice(0, 5)
        .map((e: any) => e.content || e)
        .join("; ");
      contextParts.push(`Relevant facts: ${explicit}`);
    }

    if (contextResult.representation?.deductive?.length) {
      const deductive = contextResult.representation.deductive
        .slice(0, 3)
        .map((d: any) => d.conclusion)
        .join("; ");
      contextParts.push(`Insights: ${deductive}`);
    }

    if (contextResult.peer_card?.length) {
      contextParts.push(`Profile: ${contextResult.peer_card.join("; ")}`);
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
