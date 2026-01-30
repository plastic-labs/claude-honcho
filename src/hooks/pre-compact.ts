import Honcho from "@honcho-ai/core";
import { loadConfig, getSessionForPath, getHonchoClientOptions } from "../config.js";
import { basename } from "path";
import {
  getCachedWorkspaceId,
  setCachedWorkspaceId,
  getCachedPeerId,
  setCachedPeerId,
  getCachedSessionId,
  setCachedSessionId,
} from "../cache.js";
import { Spinner } from "../spinner.js";
import { logHook, logApiCall, setLogContext } from "../log.js";

const WORKSPACE_APP_TAG = "honcho-plugin";

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  trigger?: "manual" | "auto";
  custom_instructions?: string;
}

function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  return basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

/**
 * Format a compact memory card that survives summarization
 * This is injected RIGHT BEFORE compaction so it becomes part of the summary
 */
function formatMemoryCard(
  config: { peerName: string; claudePeer: string; workspace: string },
  sessionName: string,
  userContext: any,
  claudeContext: any,
  summaries: any,
  userDialectic: string | null,
  claudeDialectic: string | null
): string {
  const parts: string[] = [];

  // Header - identity anchor
  parts.push(`## HONCHO MEMORY ANCHOR (Pre-Compaction Injection)
This context is being injected because the conversation is about to be summarized.
These facts MUST be preserved in the summary.

### Session Identity
- User: ${config.peerName}
- AI: ${config.claudePeer}
- Workspace: ${config.workspace}
- Session: ${sessionName}`);

  // User profile - critical to preserve
  if (userContext?.peer_card?.length > 0) {
    parts.push(`### ${config.peerName}'s Profile (PRESERVE)
${userContext.peer_card.join("\n")}`);
  }

  // Key user facts - explicit knowledge
  if (userContext?.representation?.explicit?.length > 0) {
    const facts = userContext.representation.explicit
      .slice(0, 10)
      .map((e: any) => `- ${e.content || e}`)
      .join("\n");
    parts.push(`### Key Facts About ${config.peerName} (PRESERVE)
${facts}`);
  }

  // User preferences from deductive reasoning
  if (userContext?.representation?.deductive?.length > 0) {
    const insights = userContext.representation.deductive
      .slice(0, 5)
      .map((d: any) => `- ${d.conclusion}`)
      .join("\n");
    parts.push(`### ${config.peerName}'s Preferences & Patterns (PRESERVE)
${insights}`);
  }

  // Claude's self-context - what was I working on
  if (claudeContext?.representation?.explicit?.length > 0) {
    const claudeFacts = claudeContext.representation.explicit
      .slice(0, 8)
      .map((e: any) => `- ${e.content || e}`)
      .join("\n");
    parts.push(`### ${config.claudePeer}'s Recent Work (PRESERVE)
${claudeFacts}`);
  }

  // Session summary - what we were doing
  if (summaries?.short_summary?.content) {
    parts.push(`### Session Context (PRESERVE)
${summaries.short_summary.content}`);
  }

  // Fresh dialectic insights - expensive but worth it at compaction time
  if (userDialectic) {
    parts.push(`### AI Understanding of ${config.peerName} (PRESERVE)
${userDialectic}`);
  }

  if (claudeDialectic) {
    parts.push(`### ${config.claudePeer}'s Self-Reflection (PRESERVE)
${claudeDialectic}`);
  }

  parts.push(`### End Memory Anchor
The above context represents persistent memory from Honcho.
When summarizing this conversation, ensure these facts are preserved.`);

  return parts.join("\n\n");
}

export async function handlePreCompact(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    // No config, nothing to inject
    process.exit(0);
  }

  let hookInput: HookInput = {};
  try {
    const input = await Bun.stdin.text();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    // No input, continue with defaults
  }

  const cwd = hookInput.cwd || process.cwd();
  const trigger = hookInput.trigger || "auto";

  // Set log context
  setLogContext(cwd, getSessionName(cwd));

  logHook("pre-compact", `Compaction triggered (${trigger})`);

  // Show spinner for auto compaction (context window full)
  const spinner = new Spinner({ style: "neural" });
  if (trigger === "auto") {
    spinner.start("anchoring memory before compaction");
  }

  try {
    const client = new Honcho(getHonchoClientOptions(config));

    // Get workspace ID (use cache)
    let workspaceId = getCachedWorkspaceId(config.workspace);
    if (!workspaceId) {
      const workspace = await client.workspaces.getOrCreate({
        id: config.workspace,
        metadata: { app: WORKSPACE_APP_TAG },
      });
      workspaceId = workspace.id;
      setCachedWorkspaceId(config.workspace, workspaceId);
    }

    // Get session ID (use cache)
    const sessionName = getSessionName(cwd);
    let sessionId = getCachedSessionId(cwd);
    if (!sessionId) {
      const session = await client.workspaces.sessions.getOrCreate(workspaceId, {
        id: sessionName,
        metadata: { cwd },
      });
      sessionId = session.id;
      setCachedSessionId(cwd, sessionName, sessionId);
    }

    // Get peer IDs (use cache)
    let userPeerId = getCachedPeerId(config.peerName);
    let claudePeerId = getCachedPeerId(config.claudePeer);

    if (!userPeerId) {
      const peer = await client.workspaces.peers.getOrCreate(workspaceId, { id: config.peerName });
      userPeerId = peer.id;
      setCachedPeerId(config.peerName, peer.id);
    }
    if (!claudePeerId) {
      const peer = await client.workspaces.peers.getOrCreate(workspaceId, { id: config.claudePeer });
      claudePeerId = peer.id;
      setCachedPeerId(config.claudePeer, peer.id);
    }

    if (trigger === "auto") {
      spinner.update("fetching memory context");
    }

    logApiCall("peers.getContext", "GET", `${config.peerName} + ${config.claudePeer}`);
    logApiCall("sessions.summaries", "GET", sessionName);
    logApiCall("peers.chat", "POST", "dialectic queries x2");

    // Fetch ALL context in parallel - this is the RIGHT time for expensive calls
    // because the context is about to be reset anyway
    const [userContextResult, claudeContextResult, summariesResult, userChatResult, claudeChatResult] =
      await Promise.allSettled([
        // User's full context
        client.workspaces.peers.getContext(workspaceId, userPeerId, {
          max_observations: 30,
          include_most_derived: true,
        }),
        // Claude's self-context
        client.workspaces.peers.getContext(workspaceId, claudePeerId, {
          max_observations: 20,
          include_most_derived: true,
        }),
        // Session summaries
        client.workspaces.sessions.summaries(workspaceId, sessionId),
        // Fresh dialectic - ask about user (worth the cost at compaction time)
        client.workspaces.peers.chat(workspaceId, userPeerId, {
          query: `Summarize the most important things to remember about ${config.peerName}. Focus on their preferences, working style, current projects, and any critical context that should survive a conversation summary.`,
          session_id: sessionId,
        }),
        // Fresh dialectic - claude self-reflection
        client.workspaces.peers.chat(workspaceId, claudePeerId, {
          query: `What are the most important things ${config.claudePeer} was working on with ${config.peerName}? Summarize key context that should be preserved.`,
          session_id: sessionId,
        }),
      ]);

    // Extract results
    const userContext = userContextResult.status === "fulfilled" ? userContextResult.value : null;
    const claudeContext = claudeContextResult.status === "fulfilled" ? claudeContextResult.value : null;
    const summaries = summariesResult.status === "fulfilled" ? summariesResult.value : null;
    const userDialectic =
      userChatResult.status === "fulfilled" && userChatResult.value?.content
        ? userChatResult.value.content
        : null;
    const claudeDialectic =
      claudeChatResult.status === "fulfilled" && claudeChatResult.value?.content
        ? claudeChatResult.value.content
        : null;

    // Format the memory card
    const memoryCard = formatMemoryCard(
      config,
      sessionName,
      userContext,
      claudeContext,
      summaries,
      userDialectic,
      claudeDialectic
    );

    if (trigger === "auto") {
      spinner.stop("memory anchored");
    }

    logHook("pre-compact", `Memory anchored (${memoryCard.length} chars)`);

    // Output the memory card - this gets included in pre-compaction context
    // and will be preserved in the summary
    console.log(`[${config.claudePeer}/Honcho Memory Anchor]\n\n${memoryCard}`);
    process.exit(0);
  } catch (error) {
    logHook("pre-compact", `Error: ${error}`, { error: String(error) });
    if (trigger === "auto") {
      spinner.fail("memory anchor failed");
    }
    // Don't block compaction on failure
    console.error(`[honcho] Pre-compact warning: ${error}`);
    process.exit(0);
  }
}
