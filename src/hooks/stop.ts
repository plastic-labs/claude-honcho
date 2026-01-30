import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, getHonchoClientOptions } from "../config.js";
import { basename } from "path";
import { existsSync, readFileSync } from "fs";
import { getClaudeInstanceId } from "../cache.js";
import { logHook, logApiCall, setLogContext } from "../log.js";

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  stop_hook_active?: boolean;
}

interface TranscriptEntry {
  type?: string;
  role?: string;
  message?: {
    role?: string;
    content: string | Array<{ type: string; text?: string; name?: string; input?: any }>;
  };
  content?: string | Array<{ type: string; text?: string }>;
}

function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  return basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

/**
 * Check if content is meaningful (not just tool announcements)
 */
function isMeaningfulContent(content: string): boolean {
  if (content.length < 50) return false;

  // Skip pure tool invocation announcements
  const toolAnnouncements = [
    /^(I'll|Let me|I'm going to|I will|Now I'll|First,? I'll)\s+(run|use|execute|check|read|look at|search|edit|write|create)/i,
  ];
  for (const pattern of toolAnnouncements) {
    if (pattern.test(content.trim()) && content.length < 200) {
      return false;
    }
  }

  return content.length >= 100;
}

/**
 * Extract the last assistant message from the transcript
 */
function getLastAssistantMessage(transcriptPath: string): string | null {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return null;
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n").filter((line) => line.trim());

    // Read from the end to find the last assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry: TranscriptEntry = JSON.parse(lines[i]);

        const entryType = entry.type || entry.role;
        const messageContent = entry.message?.content || entry.content;

        if (entryType === "assistant" && messageContent) {
          let assistantContent = "";

          if (typeof messageContent === "string") {
            assistantContent = messageContent;
          } else if (Array.isArray(messageContent)) {
            // Extract text blocks only (skip tool_use blocks)
            const textBlocks = messageContent
              .filter((p) => p.type === "text" && p.text)
              .map((p) => p.text!)
              .join("\n\n");

            assistantContent = textBlocks;
          }

          if (assistantContent && assistantContent.trim()) {
            return assistantContent;
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Failed to read transcript
  }

  return null;
}

export async function handleStop(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

  // Skip if message saving is disabled
  if (config.saveMessages === false) {
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

  // If stop_hook_active is true, Claude is already continuing from a previous stop hook
  // Don't process to avoid infinite loops
  if (hookInput.stop_hook_active) {
    process.exit(0);
  }

  const cwd = hookInput.cwd || process.cwd();
  const transcriptPath = hookInput.transcript_path;
  const sessionName = getSessionName(cwd);

  // Set log context
  setLogContext(cwd, sessionName);

  // Get the last assistant message from the transcript
  const lastMessage = getLastAssistantMessage(transcriptPath || "");

  if (!lastMessage || !isMeaningfulContent(lastMessage)) {
    logHook("stop", `Skipping (no meaningful content)`);
    process.exit(0);
  }

  logHook("stop", `Capturing assistant response (${lastMessage.length} chars)`);

  try {
    const honcho = new Honcho(getHonchoClientOptions(config));

    // Get session and peer using new fluent API
    const session = await honcho.session(sessionName);
    const claudePeer = await honcho.peer(config.claudePeer);

    // Upload the assistant response
    const instanceId = getClaudeInstanceId();
    logApiCall("session.addMessages", "POST", `assistant response (${lastMessage.length} chars)`);

    await session.addMessages([
      claudePeer.message(lastMessage.slice(0, 3000), {
        metadata: {
          instance_id: instanceId || undefined,
          type: "assistant_response",
          session_affinity: sessionName,
        },
      }),
    ]);

    logHook("stop", `Assistant response saved`);
  } catch (error) {
    logHook("stop", `Upload failed: ${error}`, { error: String(error) });
  }

  process.exit(0);
}
