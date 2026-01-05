import Honcho from "@honcho-ai/core";
import { loadConfig, getSessionForPath } from "../config.js";
import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import {
  getCachedWorkspaceId,
  setCachedWorkspaceId,
  getCachedPeerId,
  setCachedPeerId,
  getCachedSessionId,
  setCachedSessionId,
  getQueuedMessages,
  markMessagesUploaded,
  generateClawdSummary,
  saveClawdLocalContext,
  loadClawdLocalContext,
} from "../cache.js";

const WORKSPACE_APP_TAG = "honcho-clawd";

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  reason?: string;
}

interface TranscriptEntry {
  type: string;
  message?: {
    content: string | Array<{ type: string; text?: string }>;
  };
}

function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  return basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

function parseTranscript(transcriptPath: string): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  if (!transcriptPath || !existsSync(transcriptPath)) {
    return messages;
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);

        if (entry.type === "user" && entry.message) {
          const userContent =
            typeof entry.message.content === "string"
              ? entry.message.content
              : entry.message.content
                  .filter((p) => p.type === "text")
                  .map((p) => p.text || "")
                  .join("");
          if (userContent) {
            messages.push({ role: "user", content: userContent });
          }
        } else if (entry.type === "assistant" && entry.message) {
          let assistantContent = "";
          if (typeof entry.message.content === "string") {
            assistantContent = entry.message.content;
          } else if (Array.isArray(entry.message.content)) {
            assistantContent = entry.message.content
              .filter((p) => p.type === "text")
              .map((p) => p.text || "")
              .join("");
          }
          if (assistantContent) {
            messages.push({ role: "assistant", content: assistantContent.slice(0, 2000) });
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

  try {
    const client = new Honcho({
      apiKey: config.apiKey,
      environment: "production",
    });

    // Get or create workspace (use cache)
    let workspaceId = getCachedWorkspaceId(config.workspace);
    if (!workspaceId) {
      const workspace = await client.workspaces.getOrCreate({
        id: config.workspace,
        metadata: { app: WORKSPACE_APP_TAG },
      });
      workspaceId = workspace.id;
      setCachedWorkspaceId(config.workspace, workspaceId);
    }

    // Get or create session (use cache)
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

    // Ensure peers exist (use cache)
    let userPeerId = getCachedPeerId(config.peerName);
    let clawdPeerId = getCachedPeerId(config.claudePeer);

    if (!userPeerId) {
      const peer = await client.workspaces.peers.getOrCreate(workspaceId, { id: config.peerName });
      userPeerId = peer.id;
      setCachedPeerId(config.peerName, peer.id);
    }
    if (!clawdPeerId) {
      const peer = await client.workspaces.peers.getOrCreate(workspaceId, { id: config.claudePeer });
      clawdPeerId = peer.id;
      setCachedPeerId(config.claudePeer, peer.id);
    }

    // Parse transcript
    const transcriptMessages = transcriptPath ? parseTranscript(transcriptPath) : [];

    // =====================================================
    // Step 1: Upload queued user messages (backup for failed fire-and-forget)
    // =====================================================
    const queuedMessages = getQueuedMessages();
    if (queuedMessages.length > 0) {
      const userMessages = queuedMessages.map((msg) => ({
        content: msg.content,
        peer_id: config.peerName,
      }));
      await client.workspaces.sessions.messages.create(workspaceId, sessionId, {
        messages: userMessages,
      });
      markMessagesUploaded();
    }

    // =====================================================
    // Step 2: Save assistant messages that weren't captured by post-tool-use
    // post-tool-use only logs tool activity, not Claude's prose responses
    // =====================================================
    let assistantMessages: Array<{ role: string; content: string }> = [];
    if (config.saveMessages !== false && transcriptMessages.length > 0) {
      // Extract assistant prose (non-tool responses) for clawd peer
      assistantMessages = transcriptMessages
        .filter((msg) => msg.role === "assistant")
        .slice(-30);

      // Upload assistant messages for clawd peer knowledge extraction
      if (assistantMessages.length > 0) {
        const messagesToSend = assistantMessages.map((msg) => ({
          content: msg.content,
          peer_id: config.claudePeer,
        }));

        await client.workspaces.sessions.messages.create(workspaceId, sessionId, {
          messages: messagesToSend,
        });
      }
    }

    // =====================================================
    // Step 3: Generate and save clawd self-summary
    // =====================================================
    const workItems = extractWorkItems(assistantMessages.map((m) => m.content));
    const existingContext = loadClawdLocalContext();

    // Preserve recent activity from existing context
    let recentActivity = "";
    if (existingContext) {
      const activityMatch = existingContext.match(/## Recent Activity\n([\s\S]*)/);
      if (activityMatch) {
        recentActivity = activityMatch[1];
      }
    }

    const newSummary = generateClawdSummary(
      sessionName,
      workItems,
      assistantMessages.map((m) => m.content)
    );

    // Append preserved activity
    saveClawdLocalContext(newSummary + recentActivity);

    // =====================================================
    // Step 4: Log session end marker
    // =====================================================
    await client.workspaces.sessions.messages.create(workspaceId, sessionId, {
      messages: [
        {
          content: `[Session ended] Reason: ${reason}, Messages: ${transcriptMessages.length}, Time: ${new Date().toISOString()}`,
          peer_id: config.claudePeer,
        },
      ],
    });

    console.log(`[honcho-clawd] Session saved: ${assistantMessages.length} assistant messages, ${queuedMessages.length} queued messages processed`);
    process.exit(0);
  } catch (error) {
    console.error(`[honcho-clawd] Warning: ${error}`);
    process.exit(1);
  }
}
