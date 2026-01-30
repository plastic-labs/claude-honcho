import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, getHonchoClientOptions } from "../config.js";
import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import {
  getQueuedMessages,
  markMessagesUploaded,
  generateClaudeSummary,
  saveClaudeLocalContext,
  loadClaudeLocalContext,
  getClaudeInstanceId,
} from "../cache.js";
import { playCooldown } from "../spinner.js";
import { logHook, logApiCall, setLogContext } from "../log.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  reason?: string;
}

interface TranscriptEntry {
  type: string;
  message?: {
    role?: string;
    content: string | Array<{ type: string; text?: string; name?: string; input?: any }>;
  };
  // Alternative format sometimes seen
  role?: string;
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
 * Check if assistant content is meaningful prose vs just tool acknowledgment
 * We want to capture explanations, summaries, recommendations - not "I'll run git status"
 */
function isMeaningfulAssistantContent(content: string): boolean {
  // Skip very short responses
  if (content.length < 50) return false;

  // Skip responses that are mostly tool invocation announcements
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

  // Skip if it's just acknowledging tool results without explanation
  if (/^(The command|The file|The output|This shows|Here's what)/i.test(content.trim()) && content.length < 150) {
    return false;
  }

  // Keep: explanations, summaries, recommendations, analysis
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

  // If it's long enough, probably meaningful
  return content.length >= 200;
}

function parseTranscript(transcriptPath: string): Array<{ role: string; content: string; isMeaningful?: boolean }> {
  const messages: Array<{ role: string; content: string; isMeaningful?: boolean }> = [];

  if (!transcriptPath || !existsSync(transcriptPath)) {
    return messages;
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);

        // Handle different transcript formats
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
            messages.push({ role: "user", content: userContent });
          }
        } else if (entryType === "assistant" && messageContent) {
          let assistantContent = "";

          if (typeof messageContent === "string") {
            assistantContent = messageContent;
          } else if (Array.isArray(messageContent)) {
            // Extract text blocks (skip tool_use blocks - those are captured by PostToolUse)
            const textBlocks = messageContent
              .filter((p) => p.type === "text" && p.text)
              .map((p) => p.text!)
              .join("\n\n");

            // Also note what tools were used for context
            const toolUses = messageContent
              .filter((p) => p.type === "tool_use")
              .map((p: any) => p.name)
              .filter(Boolean);

            assistantContent = textBlocks;

            // If there were tool uses but minimal text, note what tools were used
            if (toolUses.length > 0 && textBlocks.length < 100) {
              assistantContent = textBlocks + (textBlocks ? "\n" : "") + `[Used tools: ${toolUses.join(", ")}]`;
            }
          }

          if (assistantContent && assistantContent.trim()) {
            const isMeaningful = isMeaningfulAssistantContent(assistantContent);
            // Truncate but keep more of meaningful content
            const maxLen = isMeaningful ? 3000 : 1500;
            messages.push({
              role: "assistant",
              content: assistantContent.slice(0, maxLen),
              isMeaningful,
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

export async function handleSessionEnd(): Promise<void> {
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
    // Continue with defaults
  }

  const cwd = hookInput.cwd || process.cwd();
  const reason = hookInput.reason || "unknown";
  const transcriptPath = hookInput.transcript_path;

  // Set log context
  setLogContext(cwd, getSessionName(cwd));

  // Play cooldown animation
  await playCooldown("saving memory");

  logHook("session-end", `Session ending`, { reason });

  try {
    const honcho = new Honcho(getHonchoClientOptions(config));
    const sessionName = getSessionName(cwd);

    // Get session and peers using new fluent API
    const session = await honcho.session(sessionName);
    const userPeer = await honcho.peer(config.peerName);
    const claudePeer = await honcho.peer(config.claudePeer);

    // Parse transcript
    const transcriptMessages = transcriptPath ? parseTranscript(transcriptPath) : [];

    // =====================================================
    // Step 1: Upload queued user messages (backup for failed fire-and-forget)
    // Only upload messages for THIS session (by cwd), not other sessions
    // =====================================================
    const instanceId = getClaudeInstanceId();
    const queuedMessages = getQueuedMessages(cwd);  // Filter by current session's cwd
    logHook("session-end", `Processing ${queuedMessages.length} queued messages`);
    if (queuedMessages.length > 0) {
      // Skip oversized messages (likely pastes/dumps, not useful observations)
      const validMessages = queuedMessages.filter((msg) => msg.content.length < 5000);
      if (validMessages.length > 0) {
        logApiCall("session.addMessages", "POST", `${validMessages.length} queued user messages`);
        const userMessages = validMessages.map((msg) =>
          userPeer.message(msg.content, {
            metadata: {
              instance_id: msg.instanceId || undefined,
              session_affinity: sessionName,
            },
          })
        );
        await session.addMessages(userMessages);
      }
      markMessagesUploaded(cwd);  // Only clear this session's messages
    }

    // =====================================================
    // Step 2: Save assistant messages that weren't captured by post-tool-use
    // post-tool-use only logs tool activity, not Claude's prose responses
    // This captures: explanations, summaries, recommendations, analysis
    // =====================================================
    let assistantMessages: Array<{ role: string; content: string; isMeaningful?: boolean }> = [];
    if (config.saveMessages !== false && transcriptMessages.length > 0) {
      // Extract assistant prose - prioritize meaningful content
      const allAssistant = transcriptMessages.filter((msg) => msg.role === "assistant");

      // Prioritize meaningful messages (explanations, summaries, etc.)
      const meaningful = allAssistant.filter((msg) => msg.isMeaningful);
      const other = allAssistant.filter((msg) => !msg.isMeaningful);

      // Take all meaningful + recent others, up to 40 total
      assistantMessages = [
        ...meaningful.slice(-25),  // Keep more meaningful content
        ...other.slice(-15),       // Keep some context
      ].slice(-40);

      // Upload assistant messages for claude peer knowledge extraction
      // This is the KEY fix: capturing actual reasoning, not just tool calls
      if (assistantMessages.length > 0) {
        const meaningfulCount = assistantMessages.filter(m => m.isMeaningful).length;
        logApiCall("session.addMessages", "POST", `${assistantMessages.length} assistant msgs (${meaningfulCount} meaningful)`);

        const messagesToSend = assistantMessages.map((msg) =>
          claudePeer.message(msg.content, {
            metadata: {
              instance_id: instanceId || undefined,
              type: msg.isMeaningful ? 'assistant_prose' : 'assistant_brief',
              meaningful: msg.isMeaningful || false,
              session_affinity: sessionName,
            },
          })
        );

        await session.addMessages(messagesToSend);
      }
    }

    // =====================================================
    // Step 3: Generate and save claude self-summary
    // =====================================================
    const workItems = extractWorkItems(assistantMessages.map((m) => m.content));
    const existingContext = loadClaudeLocalContext();

    // Preserve recent activity from existing context
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

    // Append preserved activity
    saveClaudeLocalContext(newSummary + recentActivity);

    // =====================================================
    // Step 4: Log session end marker
    // =====================================================
    await session.addMessages([
      claudePeer.message(
        `[Session ended] Reason: ${reason}, Messages: ${transcriptMessages.length}, Time: ${new Date().toISOString()}`,
        {
          metadata: {
            instance_id: instanceId || undefined,
            session_affinity: sessionName,
          },
        }
      ),
    ]);

    const meaningfulCount = assistantMessages.filter(m => m.isMeaningful).length;
    logHook("session-end", `Session saved: ${assistantMessages.length} assistant msgs (${meaningfulCount} meaningful), ${queuedMessages.length} queued msgs`);
    console.log(`[honcho] Session saved: ${assistantMessages.length} assistant messages (${meaningfulCount} with meaningful prose), ${queuedMessages.length} queued messages`);
    process.exit(0);
  } catch (error) {
    logHook("session-end", `Error: ${error}`, { error: String(error) });
    console.error(`[honcho] Warning: ${error}`);
    process.exit(1);
  }
}
