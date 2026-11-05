import { initHook, loadConfig, getSessionName, isPluginEnabled, getCachedStdin, readStdinText, getObservationMode } from "../config.js";
import { createHonchoClient } from "../honcho-client.js";
import { Spinner } from "../spinner.js";
import { setMemoryState } from "../state.js";
import { logHook, logApiCall, setLogContext } from "../log.js";
import { verboseList, visAnchorSummary } from "../visual.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  trigger?: "manual" | "auto";
  custom_instructions?: string;
  workspace_roots?: string[];
}

/**
 * Format a compact memory card that survives summarization.
 * This is injected RIGHT BEFORE compaction so it becomes part of the summary.
 * Only the session identity and the peer card: anything else is recalled on
 * demand through the chat tool, so nothing is fetched with context() or chat().
 */
function formatMemoryCard(
  config: { peerName: string; aiPeer: string; workspace: string },
  sessionName: string,
  peerCard: string[] | null
): string {
  const parts: string[] = [];

  parts.push(`## HONCHO MEMORY ANCHOR (Pre-Compaction Injection)
This context is being injected because the conversation is about to be summarized.
Preserve it in the summary.

### Session Identity
- User: ${config.peerName}
- AI: ${config.aiPeer}
- Workspace: ${config.workspace}
- Session: ${sessionName}`);

  if (peerCard?.length) {
    parts.push(`### ${config.peerName}'s Profile (PRESERVE)
${peerCard.join("\n")}`);
  }

  parts.push(`### End Memory Anchor
Anything else about ${config.peerName} can be recalled with the Honcho \`chat\` tool.`);

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

  const sessionName = getSessionName(hookInput.session_id);
  setLogContext(cwd, sessionName ?? undefined);
  if (!sessionName) {
    logHook("pre-compact", "No Claude Code session id; skipping");
    process.exit(0);
  }

  logHook("pre-compact", `Compaction triggered (${trigger})`);

  // Show spinner for auto compaction (context window full)
  const spinner = new Spinner({ style: "neural" });
  if (trigger === "auto") {
    spinner.start("anchoring memory before compaction");
  }
  setMemoryState("compacting", undefined, hookInput.session_id);

  try {
    const honcho = await createHonchoClient(config);
    const observationMode = getObservationMode(config);

    if (trigger === "auto") {
      spinner.update("fetching peer card");
    }

    // unified: the user's own card; directional: the AI peer's card of the user.
    const cardLabel = observationMode === "unified" ? "userPeer.getCard()" : `aiPeer.getCard(target=${config.peerName})`;
    const fetchStart = Date.now();
    const peerCard = await (observationMode === "unified"
      ? (await honcho.peer(config.peerName)).getCard()
      : (await honcho.peer(config.aiPeer)).getCard(config.peerName)
    ).catch(() => null);
    const fetchMs = Date.now() - fetchStart;
    logApiCall(cardLabel, "GET", observationMode === "unified" ? "self" : `target=${config.peerName}`, fetchMs, peerCard !== null);
    verboseList(`pre-compact ${cardLabel}`, peerCard);

    const memoryCard = formatMemoryCard(config, sessionName, peerCard);

    if (trigger === "auto") {
      spinner.stop("memory anchored");
    }
    setMemoryState("idle", undefined, hookInput.session_id);

    logHook("pre-compact", `Memory anchored (${memoryCard.length} chars)`);

    const anchored = peerCard?.length ? [`peer card (${peerCard.length} items)`] : [];
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
