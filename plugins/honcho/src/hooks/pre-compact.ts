import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin } from "../config.js";
import { Spinner } from "../spinner.js";
import { logHook, logApiCall, setLogContext } from "../log.js";
import { formatVerboseBlock, formatVerboseList } from "../visual.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  trigger?: "manual" | "auto";
  custom_instructions?: string;
}

/**
 * Format a compact memory card that survives summarization
 * This is injected RIGHT BEFORE compaction so it becomes part of the summary
 */
function formatMemoryCard(
  config: { peerName: string; aiPeer: string; workspace: string },
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
These conclusions MUST be preserved in the summary.

### Session Identity
- User: ${config.peerName}
- AI: ${config.aiPeer}
- Workspace: ${config.workspace}
- Session: ${sessionName}`);

  // User profile - critical to preserve
  const userPeerCard = userContext?.peerCard;
  if (userPeerCard?.length > 0) {
    parts.push(`### ${config.peerName}'s Profile (PRESERVE)
${userPeerCard.join("\n")}`);
  }

  // Key user conclusions
  const userRep = userContext?.representation;
  if (typeof userRep === "string" && userRep.trim()) {
    parts.push(`### Key Conclusions About ${config.peerName} (PRESERVE)\n${userRep}`);
  }

  // Claude's self-context - what was I working on
  const claudeRep = claudeContext?.representation;
  if (typeof claudeRep === "string" && claudeRep.trim()) {
    parts.push(`### ${config.aiPeer}'s Recent Work (PRESERVE)\n${claudeRep}`);
  }

  // Session summary - what we were doing
  const shortSummary = summaries?.shortSummary;
  if (shortSummary?.content) {
    parts.push(`### Session Context (PRESERVE)
${shortSummary.content}`);
  }

  // Fresh dialectic insights - expensive but worth it at compaction time
  if (userDialectic) {
    parts.push(`### AI Understanding of ${config.peerName} (PRESERVE)
${userDialectic}`);
  }

  if (claudeDialectic) {
    parts.push(`### ${config.aiPeer}'s Self-Reflection (PRESERVE)
${claudeDialectic}`);
  }

  parts.push(`### End Memory Anchor
The above context represents persistent memory from Honcho.
When summarizing this conversation, ensure these conclusions are preserved.`);

  return parts.join("\n\n");
}

export async function handlePreCompact(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    // No config, nothing to inject
    process.exit(0);
  }

  // Early exit if plugin is disabled
  if (!isPluginEnabled()) {
    process.exit(0);
  }

  let hookInput: HookInput = {};
  try {
    const input = getCachedStdin() ?? await Bun.stdin.text();
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
    const honcho = new Honcho(getHonchoClientOptions(config));
    const sessionName = getSessionName(cwd);

    // Get session and peers using new fluent API
    const session = await honcho.session(sessionName);
    const userPeer = await honcho.peer(config.peerName);
    const aiPeer = await honcho.peer(config.aiPeer);

    if (trigger === "auto") {
      spinner.update("fetching memory context");
    }

    logApiCall("peer.context", "GET", `${config.peerName} + ${config.aiPeer}`);
    logApiCall("session.summaries", "GET", sessionName);
    logApiCall("peer.chat", "POST", "dialectic queries x2");

    // Fetch ALL context in parallel - this is the RIGHT time for expensive calls
    // because the context is about to be reset anyway
    const [userContextResult, claudeContextResult, summariesResult, userChatResult, claudeChatResult] =
      await Promise.allSettled([
        // User's full context
        userPeer.context({
          maxConclusions: 30,
          includeMostFrequent: true,
        }),
        // Claude's self-context
        aiPeer.context({
          maxConclusions: 20,
          includeMostFrequent: true,
        }),
        // Session summaries
        session.summaries(),
        // Fresh dialectic - ask about user (worth the cost at compaction time)
        userPeer.chat(
          `Summarize the most important things to remember about ${config.peerName}. Focus on their preferences, working style, current projects, and any critical context that should survive a conversation summary.`,
          { session }
        ),
        // Fresh dialectic - claude self-reflection
        aiPeer.chat(
          `What are the most important things ${config.aiPeer} was working on with ${config.peerName}? Summarize key context that should be preserved.`,
          { session }
        ),
      ]);

    // Extract results
    const userContext = userContextResult.status === "fulfilled" ? userContextResult.value : null;
    const claudeContext = claudeContextResult.status === "fulfilled" ? claudeContextResult.value : null;
    const summaries = summariesResult.status === "fulfilled" ? summariesResult.value : null;

    // Build verbose output blocks — these will be appended to stdout after the
    // memory card. PreCompact stdout is only shown in Ctrl+O, so verbose data
    // is hidden by default and visible when the user presses Ctrl+O.
    const verboseBlocks: string[] = [];
    verboseBlocks.push(formatVerboseBlock("pre-compact peer.context(user)", (userContext as any)?.representation));
    verboseBlocks.push(formatVerboseBlock("pre-compact peer.context(claude)", (claudeContext as any)?.representation));
    verboseBlocks.push(formatVerboseList("pre-compact peerCard", (userContext as any)?.peerCard));

    const userDialectic =
      userChatResult.status === "fulfilled"
        ? userChatResult.value
        : null;
    const claudeDialectic =
      claudeChatResult.status === "fulfilled"
        ? claudeChatResult.value
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

    // Add dialectic responses to verbose output
    if (userDialectic) {
      verboseBlocks.push(formatVerboseBlock(`pre-compact peer.chat(user) → "${config.peerName}"`, userDialectic));
    }
    if (claudeDialectic) {
      verboseBlocks.push(formatVerboseBlock(`pre-compact peer.chat(claude) → "${config.aiPeer}"`, claudeDialectic));
    }

    logHook("pre-compact", `Memory anchored (${memoryCard.length} chars)`);

    // Output memory card to stdout, followed by verbose API data.
    // PreCompact stdout is only shown in Ctrl+O, so the verbose blocks
    // are hidden by default and visible when the user presses Ctrl+O.
    const verboseOutput = verboseBlocks.filter(Boolean).join("\n");
    console.log(`[${config.aiPeer}/Honcho Memory Anchor]\n\n${memoryCard}${verboseOutput}`);
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
