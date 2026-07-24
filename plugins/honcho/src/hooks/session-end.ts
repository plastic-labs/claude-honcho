import { loadConfig, getSessionName, isPluginEnabled, getCachedStdin } from "../config.js";
import { existsSync, readFileSync } from "fs";
import {
  getInstanceIdForCwd,
} from "../cache.js";
import { clearSessionFiles } from "../state.js";
import { logHook, setLogContext } from "../log.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  reason?: string;
  workspace_roots?: string[];
}

interface TranscriptEntry {
  type: string;
  timestamp?: string;
  message?: {
    role?: string;
    content: string | Array<{ type: string; text?: string; name?: string; input?: any }>;
  };
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

function parseTranscript(transcriptPath: string): Array<{ role: string; content: string; timestamp?: string }> {
  const messages: Array<{ role: string; content: string; timestamp?: string }> = [];

  if (!transcriptPath || !existsSync(transcriptPath)) {
    return messages;
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);
        const entryType = entry.type || entry.role;
        const messageContent = entry.message?.content || entry.content;

        if (entryType === "user" && messageContent) {
          const userContent =
            typeof messageContent === "string"
              ? messageContent
              : messageContent
                  .filter((p) => p.type === "text")
                  .map((p) => p.text || "")
                  .join("\n");
          if (userContent && userContent.trim()) {
            messages.push({ role: "user", content: userContent, timestamp: entry.timestamp });
          }
        } else if (entryType === "assistant" && messageContent) {
          let assistantContent = "";

          if (typeof messageContent === "string") {
            assistantContent = messageContent;
          } else if (Array.isArray(messageContent)) {
            const textBlocks = messageContent
              .filter((p) => p.type === "text" && p.text)
              .map((p) => p.text!)
              .join("\n\n");

            const toolUses = messageContent
              .filter((p) => p.type === "tool_use")
              .map((p: any) => p.name)
              .filter(Boolean);

            assistantContent = textBlocks;

            if (toolUses.length > 0 && textBlocks.length < 100) {
              assistantContent = textBlocks + (textBlocks ? "\n" : "") + `[Used tools: ${toolUses.join(", ")}]`;
            }
          }

          if (assistantContent && assistantContent.trim()) {
            // Counted for the end-marker message tally only — assistant
            // messages upload live from the stop hook, not here.
            messages.push({
              role: "assistant",
              content: assistantContent,
              timestamp: entry.timestamp,
            });
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Failed to read transcript
  }

  return messages;
}

/**
 * SessionEnd hook — structured for resilience against cancellation.
 *
 * Priority order (most critical first):
 *   1. Parallel: cooldown animation + API uploads (critical data first)
 *   2. Session end marker (nice-to-have metadata)
 */
export async function handleSessionEnd(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

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
    // Continue with defaults
  }

  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const reason = hookInput.reason || "unknown";
  const transcriptPath = hookInput.transcript_path;
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);

  setLogContext(cwd, sessionName);
  logHook("session-end", `Session ending`, { reason });

  // =========================================================
  // Phase 1: parse transcript for the end-marker message count.
  // The on-disk local work summary was retired here — nothing consumed it, and
  // the server-side session.summaries() long summary now stays fresh on its own
  // since we upload every turn live.
  // =========================================================
  const transcriptMessages = transcriptPath ? parseTranscript(transcriptPath) : [];

  // No end-of-session upload: messages are saved live by the other hooks, and
  // the [Session ended] marker only ever derived lifecycle exhaust
  // ("claude's session ended at ...") — write-only telemetry, never read back.
  logHook("session-end", `Session ended (${transcriptMessages.length} msgs handled live)`);
  clearSessionFiles(hookInput.session_id);
  process.exit(0);
}
