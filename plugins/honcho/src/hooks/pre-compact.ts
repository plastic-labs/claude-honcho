import { Honcho } from "@honcho-ai/sdk";
import { initHook, loadConfig, getSessionForPath, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, readStdinText, getObservationMode } from "../config.js";
import { Spinner } from "../spinner.js";
import { setMemoryState } from "../state.js";
import { logHook, logApiCall, setLogContext } from "../log.js";
import { verboseApiResult, verboseList, visAnchorSummary } from "../visual.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  trigger?: "manual" | "auto";
  custom_instructions?: string;
  workspace_roots?: string[];
}

// Appended to both dialectic questions; the answers go into the anchor verbatim.
const FACTS_ONLY =
  "Answer with facts only, as a terse bullet list written in the third person. " +
  "No preamble, no closing summary, no offers to help further, and no questions.";

// A trailing offer such as "If you'd like, I can convert this into…".
const CHAT_FILLER = /^(if you('d| would)? like|if you want|let me know|would you like|want me to|i can also)\b/i;

/** Drop trailing paragraphs that are chat filler rather than facts. */
export function stripChatFiller(answer: string): string {
  const paragraphs = answer.trim().split(/\n\s*\n/);
  while (paragraphs.length > 1 && CHAT_FILLER.test(paragraphs[paragraphs.length - 1].trim())) {
    paragraphs.pop();
  }
  return paragraphs.join("\n\n");
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
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    // No input, continue with defaults
  }

  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const trigger = hookInput.trigger || "auto";

  // Set log context
  setLogContext(cwd, getSessionName(cwd));

  logHook("pre-compact", `Compaction triggered (${trigger})`);

  // Show spinner for auto compaction (context window full)
  const spinner = new Spinner({ style: "neural" });
  if (trigger === "auto") {
    spinner.start("anchoring memory before compaction");
  }
  setMemoryState("compacting", undefined, hookInput.session_id);

  try {
    const honcho = new Honcho(getHonchoClientOptions(config));
    const sessionName = getSessionName(cwd);
    const observationMode = getObservationMode(config);

    // Get session and peers using new fluent API
    const session = await honcho.session(sessionName);
    const userPeer = await honcho.peer(config.peerName);
    const aiPeer = await honcho.peer(config.aiPeer);

    // unified: user self-observations — query via userPeer.
    // directional: ai cross-observations — query via aiPeer with target.
    const contextPeer = observationMode === "unified" ? userPeer : aiPeer;
    const contextTarget = observationMode === "unified" ? undefined : config.peerName;
    const contextLabel = observationMode === "unified" ? "userPeer.context()" : `aiPeer.context(target=${config.peerName})`;

    if (trigger === "auto") {
      spinner.update("fetching memory context");
    }

    logApiCall(contextLabel, "GET", observationMode === "unified" ? "self" : `target=${config.peerName}`);
    logApiCall("session.summaries", "GET", sessionName);
    logApiCall("peer.chat", "POST", "dialectic queries x2");

    // Fetch ALL context in parallel - this is the RIGHT time for expensive calls
    // because the context is about to be reset anyway
    const fetchStart = Date.now();
    const dialecticArgs = observationMode === "unified"
      ? { session, reasoningLevel: config.reasoningLevel ?? "low" }
      : { target: config.peerName, session, reasoningLevel: config.reasoningLevel ?? "low" };

    const [userContextResult, summariesResult, userChatResult, claudeChatResult] =
      await Promise.allSettled([
        contextPeer.context({
          ...(contextTarget ? { target: contextTarget } : {}),
          maxConclusions: 30,
          includeMostFrequent: true,
        }),
        // Session summaries
        session.summaries(),
        // Fresh dialectic - ask about user (worth the cost at compaction time)
        contextPeer.chat(
          `What are the most important things to remember about ${config.peerName}? Cover their preferences, working style, current projects, and any critical context that should survive a conversation summary. ${FACTS_ONLY}`,
          dialecticArgs
        ),
        // Fresh dialectic - what were we working on together
        contextPeer.chat(
          `What are the most important things that were worked on with ${config.peerName}? ${FACTS_ONLY}`,
          dialecticArgs
        ),
      ]);
    const fetchMs = Date.now() - fetchStart;

    // Extract results
    const userContext = userContextResult.status === "fulfilled" ? userContextResult.value : null;
    const summaries = summariesResult.status === "fulfilled" ? summariesResult.value : null;

    verboseApiResult(`pre-compact ${contextLabel} → representation`, (userContext as any)?.representation);
    verboseList("pre-compact peerCard", (userContext as any)?.peerCard);

    const dialecticAnswer = (r: PromiseSettledResult<string | null>) =>
      r.status === "fulfilled" && typeof r.value === "string" && r.value.trim() ? stripChatFiller(r.value) : null;
    const userDialectic = dialecticAnswer(userChatResult);
    const claudeDialectic = dialecticAnswer(claudeChatResult);

    // Format the memory card
    const memoryCard = formatMemoryCard(
      config,
      sessionName,
      userContext,
      null,
      summaries,
      userDialectic,
      claudeDialectic
    );

    if (trigger === "auto") {
      spinner.stop("memory anchored");
    }
    setMemoryState("idle", undefined, hookInput.session_id);

    verboseApiResult(`pre-compact peer.chat(user) → "${config.peerName}"`, userDialectic);
    verboseApiResult(`pre-compact peer.chat(claude) → "${config.aiPeer}"`, claudeDialectic);

    logHook("pre-compact", `Memory anchored (${memoryCard.length} chars)`);

    // The memory card, then one summary line. Full API payloads go to the
    // verbose log only.
    const ctx = userContext as any;
    const anchored: string[] = [];
    if (ctx?.peerCard?.length) anchored.push(`peer card (${ctx.peerCard.length} items)`);
    if (typeof ctx?.representation === "string" && ctx.representation.trim()) anchored.push("conclusions");
    if ((summaries as any)?.shortSummary?.content) anchored.push("session summary");
    const answers = [userDialectic, claudeDialectic].filter(Boolean).length;
    if (answers) anchored.push(`${answers} dialectic answer${answers === 1 ? "" : "s"}`);
    console.log(`[${config.aiPeer}/Honcho Memory Anchor]\n\n${memoryCard}\n\n${visAnchorSummary("pre-compact", anchored, fetchMs)}`);
    process.exit(0);
  } catch (error) {
    logHook("pre-compact", `Error: ${error}`, { error: String(error) });
    if (trigger === "auto") {
      spinner.fail("memory anchor failed");
    }
    setMemoryState("idle", undefined, hookInput.session_id);
    // Don't block compaction on failure
    console.error(`[honcho] Pre-compact warning: ${error}`);
    process.exit(0);
  }
}

/** Entry point: reads stdin once, then runs the handler. */
export async function main(): Promise<void> {
  await initHook();
  await handlePreCompact();
}
