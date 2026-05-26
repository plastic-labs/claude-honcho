import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin } from "../config.js";
import { existsSync, readFileSync } from "fs";
import {
  generateClaudeSummary,
  saveClaudeLocalContext,
  loadClaudeLocalContext,
  getInstanceIdForCwd,
  chunkContent,
} from "../cache.js";
import { playCooldown } from "../spinner.js";
import { logHook, logApiCall, setLogContext } from "../log.js";


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

/**
 * Check if assistant content is meaningful prose vs just tool acknowledgment
 */
function isMeaningfulAssistantContent(content: string): boolean {
  if (content.length < 50) return false;

  const toolAnnouncements = [
    /^(I'll|Let me|I'm going to|I will|Now I'll|First,? I'll)\s+(run|use|execute|check|read|look at|search|edit|write|create)/i,
    /^Running\s+/i,
    /^Checking\s+/i,
    /^Looking at\s+/i,
  ];
  for (const pattern of toolAnnouncements) {
    if (pattern.test(content.trim()) && content.length < 200) {
      return false;
    }
  }

  if (/^(The command|The file|The output|This shows|Here's what)/i.test(content.trim()) && content.length < 150) {
    return false;
  }

  const meaningfulPatterns = [
    /\b(because|since|therefore|however|although|this means|in summary|to summarize|the issue is|the problem is|I recommend|you should|we should|this approach|the solution|key point|important|note that)\b/i,
    /\b(implemented|fixed|resolved|completed|added|created|updated|changed|modified|refactored)\b/i,
    /\b(error|bug|issue|problem|solution|fix|improvement|optimization)\b/i,
  ];
  for (const pattern of meaningfulPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return content.length >= 200;
}

function parseTranscript(transcriptPath: string): Array<{ role: string; content: string; isMeaningful?: boolean; timestamp?: string }> {
  const messages: Array<{ role: string; content: string; isMeaningful?: boolean; timestamp?: string }> = [];

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
            const isMeaningful = isMeaningfulAssistantContent(assistantContent);
            const maxLen = isMeaningful ? 3000 : 1500;
            messages.push({
              role: "assistant",
              content: assistantContent.slice(0, maxLen),
              isMeaningful,
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

function extractWorkItems(assistantMessages: string[]): string[] {
  const workItems: string[] = [];
  const actionPatterns = [
    /(?:created|wrote|added)\s+(?:file\s+)?([^\n.]+)/gi,
    /(?:edited|modified|updated|fixed)\s+([^\n.]+)/gi,
    /(?:implemented|built|developed)\s+([^\n.]+)/gi,
    /(?:refactored|optimized|improved)\s+([^\n.]+)/gi,
  ];

  for (const msg of assistantMessages.slice(-15)) {
    for (const pattern of actionPatterns) {
      const matches = msg.matchAll(pattern);
      for (const match of matches) {
        const item = match[1]?.trim();
        if (item && item.length < 100 && !workItems.includes(item)) {
          workItems.push(item);
        }
      }
    }
  }

  return workItems.slice(0, 10);
}

/**
 * SessionEnd hook — structured for resilience against cancellation.
 *
 * Priority order (most critical first):
 *   1. Local summary (instant, zero risk — survives any cancellation)
 *   2. Parallel: cooldown animation + API uploads (critical data first)
 *   3. Session end marker (nice-to-have metadata)
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
  // Phase 1: LOCAL WORK (instant, survives any cancellation)
  // =========================================================
  const transcriptMessages = transcriptPath ? parseTranscript(transcriptPath) : [];
  const allAssistant = transcriptMessages.filter((msg) => msg.role === "assistant");
  const meaningful = allAssistant.filter((msg) => msg.isMeaningful);
  const other = allAssistant.filter((msg) => !msg.isMeaningful);
  const assistantMessages = [
    ...meaningful.slice(-25),
    ...other.slice(-15),
  ].slice(-40);

  // Save local summary FIRST — even if the hook gets killed after this,
  // the next session-start will have context about what happened.
  const workItems = extractWorkItems(assistantMessages.map((m) => m.content));
  const existingContext = loadClaudeLocalContext();
  let recentActivity = "";
  if (existingContext) {
    const activityMatch = existingContext.match(/## Recent Activity\n([\s\S]*)/);
    if (activityMatch) {
      recentActivity = activityMatch[1];
    }
  }
  const newSummary = generateClaudeSummary(
    sessionName,
    workItems,
    assistantMessages.map((m) => m.content)
  );
  saveClaudeLocalContext(newSummary + recentActivity);

  // =========================================================
  // Phase 2: PARALLEL API UPLOADS + ANIMATION
  // Cooldown animation runs concurrently with network I/O
  // so we don't waste budget on cosmetics before critical work.
  // =========================================================
  try {
    const honcho = new Honcho(getHonchoClientOptions(config));

    const [session, aiPeer] = await Promise.all([
      honcho.session(sessionName),
      honcho.peer(config.aiPeer),
    ]);

    logHook("session-end", `Processing ${assistantMessages.length} assistant msgs`);

    const aiMessages = (config.saveMessages !== false && assistantMessages.length > 0)
      ? assistantMessages.flatMap((msg) => {
          const chunks = chunkContent(msg.content);
          return chunks.map(chunk =>
            aiPeer.message(chunk, {
              createdAt: msg.timestamp,
              metadata: {
                instance_id: instanceId || undefined,
                type: msg.isMeaningful ? 'assistant_prose' : 'assistant_brief',
                meaningful: msg.isMeaningful || false,
                session_affinity: sessionName,
              },
            })
          );
        })
      : [];

    const endMarker = aiPeer.message(
      `[Session ended] Reason: ${reason}, Messages: ${transcriptMessages.length}, Time: ${new Date().toISOString()}`,
      {
        createdAt: new Date().toISOString(),
        metadata: {
          instance_id: instanceId || undefined,
          session_affinity: sessionName,
        },
      }
    );

    // Single addMessages call with everything — one round trip instead of three.
    const allMessages = [...aiMessages, endMarker];

    if (allMessages.length > 0) {
      const meaningfulCount = assistantMessages.filter(m => m.isMeaningful).length;
      logApiCall("session.addMessages", "POST",
        `${aiMessages.length} assistant (${meaningfulCount} meaningful) + 1 marker`);

      // Start API upload immediately; run animation concurrently.
      const uploadPromise = session.addMessages(allMessages);

      // Trap SIGTERM/SIGINT to prevent default termination while upload
      // is in flight. The handler is a no-op — its only purpose is to
      // keep the process alive. Cooldown's own exit handler cleans up
      // the cursor if the process exits unexpectedly.
      const sigHandler = () => {};
      process.on("SIGINT", sigHandler);
      if (process.platform === "win32") {
        process.on("SIGBREAK", sigHandler);
      } else {
        process.on("SIGTERM", sigHandler);
      }

      const removeSigHandlers = () => {
        process.removeListener("SIGINT", sigHandler);
        if (process.platform === "win32") {
          process.removeListener("SIGBREAK", sigHandler);
        } else {
          process.removeListener("SIGTERM", sigHandler);
        }
      };

      // Hard safety net: if the upload hangs beyond SDK timeout + margin,
      // force exit. Local summary was already saved in phase 1.
      const hardTimeout = setTimeout(() => {
        logHook("session-end", "Hard timeout reached — forcing exit");
        removeSigHandlers();
        process.exit(0);
      }, 12_000);
      hardTimeout.unref();

      await Promise.all([
        uploadPromise.finally(() => {
          clearTimeout(hardTimeout);
          removeSigHandlers();
        }),
        playCooldown("saving memory"),
      ]);
    } else {
      await playCooldown("saving memory");
    }

    const meaningfulCount = assistantMessages.filter(m => m.isMeaningful).length;
    logHook("session-end", `Session saved: ${assistantMessages.length} assistant msgs (${meaningfulCount} meaningful)`);
    process.exit(0);
  } catch (error) {
    logHook("session-end", `Error: ${error}`, { error: String(error) });
    // Local summary was already saved in phase 1 — not a total loss.
    process.exit(0);
  }
}
