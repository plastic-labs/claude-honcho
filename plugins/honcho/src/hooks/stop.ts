import { Honcho, Session, Peer } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, readStdinText } from "../config.js";
import { existsSync, readFileSync } from "fs";
import { getInstanceIdForCwd, chunkContent, addMessagesBatched, getCachedSessionModel, setCachedSessionModel } from "../cache.js";
import { logHook, logApiCall, setLogContext } from "../log.js";
import { visStopMessage } from "../visual.js";

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  stop_hook_active?: boolean;
  workspace_roots?: string[];
}

interface TranscriptEntry {
  type?: string;
  role?: string;
  timestamp?: string;
  isMeta?: boolean;
  promptSource?: string;
  origin?: { kind?: string };
  message?: {
    role?: string;
    model?: string;
    content: string | Array<{ type: string; text?: string; name?: string; input?: any }>;
  };
  content?: string | Array<{ type: string; text?: string }>;
}

/** System-injected wakeup (task notification etc.). Not a real prompt, but the Stop
 *  hook already fired for everything before it, so it ends the previous segment. */
function isWakeupBoundary(entry: TranscriptEntry): boolean {
  return entry.promptSource === "system" || entry.origin?.kind === "task-notification";
}

/** True for a real user-typed prompt. Excludes tool_results, isMeta entries, and `<...>` command caveats. */
function isRealUserPrompt(entry: TranscriptEntry): boolean {
  if (entry.isMeta) return false;
  const mc = entry.message?.content ?? entry.content;
  const text =
    typeof mc === "string"
      ? mc
      : Array.isArray(mc)
        ? mc.filter((b) => b.type === "text" && b.text).map((b) => b.text!).join("")
        : "";
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<");
}

function assistantText(entry: TranscriptEntry): string {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string") return mc;
  if (Array.isArray(mc)) {
    return mc.filter((p) => p.type === "text" && p.text).map((p) => p.text!).join("\n\n");
  }
  return "";
}

/** Assistant text blocks of the just-completed segment: everything since the last
 *  real user prompt OR wakeup boundary. Wakeup firings would otherwise re-collect
 *  the whole accumulated turn, duplicating blocks already uploaded. */
export function getCurrentTurnAssistantMessages(transcriptPath: string): Array<{ text: string; timestamp?: string; model?: string }> {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];

  let lines: string[];
  try {
    lines = readFileSync(transcriptPath, "utf-8").trim().split("\n").filter((l) => l.trim());
  } catch {
    return [];
  }

  // Walk back to the last real user prompt or wakeup — the start of the current segment.
  let lastPromptIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry: TranscriptEntry = JSON.parse(lines[i]);
      if ((entry.type || entry.role) === "user" && (isRealUserPrompt(entry) || isWakeupBoundary(entry))) {
        lastPromptIdx = i;
        break;
      }
    } catch {
      continue;
    }
  }
  // return nothing if there's no last prompt
  if (lastPromptIdx === -1) return [];

  const blocks: Array<{ text: string; timestamp?: string; model?: string }> = [];
  for (let i = lastPromptIdx + 1; i < lines.length; i++) {
    try {
      const entry: TranscriptEntry = JSON.parse(lines[i]);
      if ((entry.type || entry.role) !== "assistant") continue;
      const text = assistantText(entry);
      if (text && text.trim()) blocks.push({ text, timestamp: entry.timestamp, model: entry.message?.model });
    } catch {
      continue;
    }
  }
  return blocks;
}

export async function handleStop(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

  // Early exit if plugin is disabled
  if (!isPluginEnabled()) {
    process.exit(0);
  }

  // Skip if message saving is disabled
  if (config.saveMessages === false) {
    process.exit(0);
  }

  let hookInput: HookInput = {};
  try {
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    process.exit(0);
  }

  // If stop_hook_active is true, Claude is already continuing from a previous stop hook
  // Don't process to avoid infinite loops
  if (hookInput.stop_hook_active) {
    process.exit(0);
  }

  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const transcriptPath = hookInput.transcript_path;
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);

  // Set log context
  setLogContext(cwd, sessionName);

  const turnMessages = getCurrentTurnAssistantMessages(transcriptPath || "");

  if (turnMessages.length === 0) {
    logHook("stop", `Skipping (no assistant content this turn)`);
    process.exit(0);
  }

  logHook("stop", `Capturing ${turnMessages.length} assistant message(s) this turn`);

  try {
    const honcho = new Honcho(getHonchoClientOptions(config));

    // Local peer handle, no get-or-create hop (see postUserMessage in user-prompt.ts).
    const noEnsure = () => Promise.resolve();
    const aiPeer = new Peer(config.aiPeer, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);

    // Last block is the turn's response; earlier ones are intermediate reasoning.
    const fallbackTs = new Date().toISOString();
    const lastIdx = turnMessages.length - 1;
    const messages = turnMessages.flatMap((block, i) =>
      chunkContent(block.text).map((chunk) =>
        aiPeer.message(chunk, {
          createdAt: block.timestamp || fallbackTs,
          metadata: {
            instance_id: instanceId || undefined,
            type: i === lastIdx ? "assistant_response" : "assistant_intermediate",
            session_affinity: sessionName,
            model: block.model || undefined,
          },
        })
      )
    );
    logApiCall("session.addMessages", "POST", `${turnMessages.length} assistant msg(s), ${messages.length} chunk(s), direct`);

    const session = new Session(sessionName, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
    await addMessagesBatched(session, messages, (e) => {
      logHook("stop", `Direct upload failed, retrying via get-or-create: ${e}`);
      return honcho.session(sessionName);
    });

    logHook("stop", `Saved ${turnMessages.length} assistant message(s)`);
    visStopMessage("out", `saved ${turnMessages.length} assistant msg(s)`);

    // Best-effort model attribution on session metadata (ADR-0001). The local
    // cache gates the extra roundtrip to actual model changes; setMetadata
    // overwrites the whole object, so merge onto a fresh read and only touch
    // our own keys. Last-writer-wins across parallel sessions is acceptable.
    let turnModel: string | undefined;
    for (let i = turnMessages.length - 1; i >= 0 && !turnModel; i--) turnModel = turnMessages[i].model;
    if (turnModel && getCachedSessionModel(cwd, sessionName) !== turnModel) {
      try {
        const current = await session.getMetadata();
        const models = Array.isArray(current.models) ? (current.models as string[]) : [];
        if (!models.includes(turnModel)) models.push(turnModel);
        await session.setMetadata({ ...current, models, last_model: turnModel });
        setCachedSessionModel(cwd, sessionName, turnModel);
        logApiCall("session.setMetadata", "PUT", `last_model=${turnModel}`);
      } catch (e) {
        logHook("stop", `Session model metadata update failed: ${e}`);
      }
    }
  } catch (error) {
    logHook("stop", `Upload failed: ${error}`, { error: String(error) });
  }

  process.exit(0);
}
