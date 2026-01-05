import Honcho from "@honcho-ai/core";
import { loadConfig, getSessionForPath, setSessionForPath } from "../config.js";
import { basename } from "path";
import {
  getCachedWorkspaceId,
  setCachedWorkspaceId,
  getCachedPeerId,
  setCachedPeerId,
  getCachedSessionId,
  setCachedSessionId,
  setCachedUserContext,
  setCachedClawdContext,
  loadClawdLocalContext,
  resetMessageCount,
} from "../cache.js";
import { Spinner } from "../spinner.js";

const WORKSPACE_APP_TAG = "honcho-clawd";

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  source?: string;
}

function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  return basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

function formatRepresentation(rep: any): string {
  const parts: string[] = [];

  if (rep?.explicit?.length > 0) {
    const explicit = rep.explicit
      .slice(0, 15)
      .map((e: any) => `- ${e.content || e}`)
      .join("\n");
    parts.push(`### Explicit Facts\n${explicit}`);
  }

  if (rep?.deductive?.length > 0) {
    const deductive = rep.deductive
      .slice(0, 10)
      .map((d: any) => `- ${d.conclusion} (from: ${d.premises?.join(", ") || "prior observations"})`)
      .join("\n");
    parts.push(`### Deduced Insights\n${deductive}`);
  }

  return parts.join("\n\n");
}

export async function handleSessionStart(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("[honcho-clawd] Not configured. Run: honcho-clawd init");
    process.exit(1);
  }

  let hookInput: HookInput = {};
  try {
    const input = await Bun.stdin.text();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    // No input or invalid JSON
  }

  const cwd = hookInput.cwd || process.cwd();

  // Reset message count for this session (for threshold-based knowledge graph refresh)
  resetMessageCount();

  // Start loading animation
  const spinner = new Spinner({ style: "wave" });
  spinner.start("honcho-clawd loading memory");

  try {
    const client = new Honcho({
      apiKey: config.apiKey,
      environment: "production",
    });

    // Step 1: Get or create workspace (use cache if available)
    spinner.update("Connecting to workspace");
    let workspaceId = getCachedWorkspaceId(config.workspace);
    if (!workspaceId) {
      const workspace = await client.workspaces.getOrCreate({
        id: config.workspace,
        metadata: { app: WORKSPACE_APP_TAG },
      });
      workspaceId = workspace.id;
      setCachedWorkspaceId(config.workspace, workspaceId);
    }

    // Step 2: Get or create session (use cache if available)
    spinner.update("Loading session");
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

    // Step 3: Get or create peers (use cache if available)
    let userPeerId = getCachedPeerId(config.peerName);
    let clawdPeerId = getCachedPeerId(config.claudePeer);

    const peerPromises: Promise<any>[] = [];
    if (!userPeerId) {
      peerPromises.push(
        client.workspaces.peers.getOrCreate(workspaceId, { id: config.peerName }).then((p) => {
          userPeerId = p.id;
          setCachedPeerId(config.peerName, p.id);
        })
      );
    }
    if (!clawdPeerId) {
      peerPromises.push(
        client.workspaces.peers.getOrCreate(workspaceId, { id: config.claudePeer }).then((p) => {
          clawdPeerId = p.id;
          setCachedPeerId(config.claudePeer, p.id);
        })
      );
    }
    if (peerPromises.length > 0) {
      await Promise.all(peerPromises);
    }

    // Step 4: Set session peers (fire-and-forget)
    client.workspaces.sessions.peers
      .set(workspaceId, sessionId, {
        [config.peerName]: { observe_me: true, observe_others: false },
        [config.claudePeer]: { observe_me: false, observe_others: true },
      })
      .catch(() => {});

    // Store session mapping
    if (!getSessionForPath(cwd)) {
      setSessionForPath(cwd, sessionName);
    }

    // Step 5: PARALLEL fetch all context (the big optimization!)
    spinner.update("Fetching memory context");
    const contextParts: string[] = [];

    // Header
    contextParts.push(`## Honcho Memory System Active
- User: ${config.peerName}
- AI: ${config.claudePeer}
- Workspace: ${config.workspace}
- Session: ${sessionName}
- Directory: ${cwd}`);

    // Load local clawd context immediately (instant, no API call)
    const localClawdContext = loadClawdLocalContext();
    if (localClawdContext) {
      contextParts.push(`## CLAWD Local Context (What I Was Working On)\n${localClawdContext.slice(0, 2000)}`);
    }

    // Parallel API calls for rich context
    const [userContextResult, clawdContextResult, summariesResult, userChatResult, clawdChatResult] =
      await Promise.allSettled([
        // 1. Get user's context
        client.workspaces.peers.getContext(workspaceId, userPeerId!, {
          max_observations: 30,
          include_most_derived: true,
        }),
        // 2. Get clawd's context (self-awareness!)
        client.workspaces.peers.getContext(workspaceId, clawdPeerId!, {
          max_observations: 20,
          include_most_derived: true,
        }),
        // 3. Get session summaries
        client.workspaces.sessions.summaries(workspaceId, sessionId),
        // 4. Dialectic: Ask about user
        client.workspaces.peers.chat(workspaceId, userPeerId!, {
          query: `Summarize what you know about ${config.peerName} in 2-3 sentences. Focus on their preferences, current projects, and working style.`,
          session_id: sessionId,
        }),
        // 5. Dialectic: Ask about clawd (self-reflection!)
        client.workspaces.peers.chat(workspaceId, clawdPeerId!, {
          query: `What has ${config.claudePeer} been working on recently? Summarize the AI assistant's recent activities and focus areas.`,
          session_id: sessionId,
        }),
      ]);

    // Process user context
    if (userContextResult.status === "fulfilled" && userContextResult.value) {
      const context = userContextResult.value;
      setCachedUserContext(context); // Cache for user-prompt hook

      if (context.peer_card && context.peer_card.length > 0) {
        contextParts.push(`## ${config.peerName}'s Profile\n${context.peer_card.join("\n")}`);
      }

      if (context.representation) {
        const repText = formatRepresentation(context.representation);
        if (repText) {
          contextParts.push(`## What I Know About ${config.peerName}\n${repText}`);
        }
      }
    }

    // Process clawd context (self-awareness)
    if (clawdContextResult.status === "fulfilled" && clawdContextResult.value) {
      const context = clawdContextResult.value;
      setCachedClawdContext(context); // Cache

      if (context.representation) {
        const repText = formatRepresentation(context.representation);
        if (repText) {
          contextParts.push(`## ${config.claudePeer}'s Work History (Self-Context)\n${repText}`);
        }
      }
    }

    // Process session summaries
    if (summariesResult.status === "fulfilled" && summariesResult.value) {
      const s = summariesResult.value as any;
      if (s.short_summary?.content) {
        contextParts.push(`## Recent Session Summary\n${s.short_summary.content}`);
      }
      if (s.long_summary?.content) {
        contextParts.push(`## Extended History\n${s.long_summary.content}`);
      }
    }

    // Process user dialectic response
    if (userChatResult.status === "fulfilled" && userChatResult.value?.content) {
      contextParts.push(`## AI Summary of ${config.peerName}\n${userChatResult.value.content}`);
    }

    // Process clawd dialectic response (self-reflection)
    if (clawdChatResult.status === "fulfilled" && clawdChatResult.value?.content) {
      contextParts.push(`## AI Self-Reflection (What ${config.claudePeer} Has Been Doing)\n${clawdChatResult.value.content}`);
    }

    // Stop spinner and output context
    spinner.stop("memory loaded");

    // Output all context
    console.log(`[${config.claudePeer}/Honcho Memory Loaded]\n\n${contextParts.join("\n\n")}`);
    process.exit(0);
  } catch (error) {
    spinner.fail("memory load failed");
    console.error(`[honcho-clawd] ${error}`);
    process.exit(1);
  }
}
