import Honcho from "@honcho-ai/core";
import { loadConfig, getSessionForPath, setSessionForPath, getHonchoClientOptions } from "../config.js";
import { basename } from "path";
import {
  getCachedWorkspaceId,
  setCachedWorkspaceId,
  getCachedPeerId,
  setCachedPeerId,
  getCachedSessionId,
  setCachedSessionId,
  setCachedUserContext,
  setCachedClaudeContext,
  loadClaudeLocalContext,
  resetMessageCount,
  setClaudeInstanceId,
  getCachedGitState,
  setCachedGitState,
  detectGitChanges,
  type GitState,
  type GitStateChange,
} from "../cache.js";
import { Spinner } from "../spinner.js";
import { displayHonchoStartup } from "../pixel.js";
import { captureGitState, getRecentCommits, formatGitContext, isGitRepo, inferFeatureContext, formatFeatureContext } from "../git.js";
import { logHook, logApiCall, logCache, logFlow, logAsync, setLogContext } from "../log.js";

const WORKSPACE_APP_TAG = "honcho-plugin";

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

/**
 * Sort facts by recency (most recent first)
 * Falls back to original order if no timestamps available
 */
function sortByRecency<T extends { created_at?: string; metadata?: { created_at?: string } }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.created_at || a.metadata?.created_at || '';
    const bTime = b.created_at || b.metadata?.created_at || '';
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

function formatRepresentation(rep: any): string {
  const parts: string[] = [];

  if (rep?.explicit?.length > 0) {
    // Sort by recency - recent facts are more relevant
    const sorted = sortByRecency(rep.explicit);
    const explicit = sorted
      .slice(0, 12)  // Reduced from 15 for less noise
      .map((e: any) => `- ${e.content || e}`)
      .join("\n");
    parts.push(`### Explicit Facts\n${explicit}`);
  }

  if (rep?.deductive?.length > 0) {
    // Sort by recency
    const sorted = sortByRecency(rep.deductive);
    const deductive = sorted
      .slice(0, 8)  // Reduced from 10 for less noise
      .map((d: any) => `- ${d.conclusion} (from: ${d.premises?.join(", ") || "prior observations"})`)
      .join("\n");
    parts.push(`### Deduced Insights\n${deductive}`);
  }

  return parts.join("\n\n");
}

export async function handleSessionStart(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("[honcho] Not configured. Run: honcho init");
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
  const claudeInstanceId = hookInput.session_id;

  // Store Claude's instance ID for parallel session support
  if (claudeInstanceId) {
    setClaudeInstanceId(claudeInstanceId);
  }

  // Set log context early so all logs include cwd/session
  const sessionName = getSessionName(cwd);
  setLogContext(cwd, sessionName);

  // Reset message count for this session (for threshold-based knowledge graph refresh)
  resetMessageCount();

  // Capture git state (before any API calls for speed)
  const previousGitState = getCachedGitState(cwd);
  const currentGitState = captureGitState(cwd);
  const gitChanges = currentGitState ? detectGitChanges(previousGitState, currentGitState) : [];
  const recentCommits = isGitRepo(cwd) ? getRecentCommits(cwd, 5) : [];

  // Infer feature context from git state
  const featureContext = currentGitState ? inferFeatureContext(currentGitState, recentCommits) : null;

  // Update git state cache
  if (currentGitState) {
    setCachedGitState(cwd, currentGitState);
  }

  // Start loading animation with neural style
  const spinner = new Spinner({ style: "neural" });
  spinner.start("loading memory");

  try {
    logHook("session-start", `Starting session in ${cwd}`, { branch: currentGitState?.branch });
    logFlow("init", `workspace: ${config.workspace}, peers: ${config.peerName}/${config.claudePeer}`);
    const client = new Honcho(getHonchoClientOptions(config));

    // Step 1: Get or create workspace (use cache if available)
    spinner.update("Connecting to workspace");
    let workspaceId = getCachedWorkspaceId(config.workspace);
    if (workspaceId) {
      logCache("hit", "workspace", config.workspace);
    } else {
      logCache("miss", "workspace", "fetching from Honcho");
      const startTime = Date.now();
      const workspace = await client.workspaces.getOrCreate({
        id: config.workspace,
        metadata: { app: WORKSPACE_APP_TAG },
      });
      workspaceId = workspace.id;
      setCachedWorkspaceId(config.workspace, workspaceId);
      logApiCall("workspaces.getOrCreate", "POST", config.workspace, Date.now() - startTime, true);
      logCache("write", "workspace", workspaceId.slice(0, 8));
    }

    // Step 2: Get or create session (use cache if available)
    spinner.update("Loading session");
    const sessionName = getSessionName(cwd);
    let sessionId = getCachedSessionId(cwd);

    // Build session metadata with git info and inferred feature context
    const sessionMetadata: Record<string, any> = { cwd };
    if (currentGitState) {
      sessionMetadata.git_branch = currentGitState.branch;
      sessionMetadata.git_commit = currentGitState.commit;
      sessionMetadata.git_dirty = currentGitState.isDirty;
    }
    if (featureContext) {
      sessionMetadata.feature_type = featureContext.type;
      sessionMetadata.feature_description = featureContext.description;
      sessionMetadata.feature_keywords = featureContext.keywords;
      sessionMetadata.feature_areas = featureContext.areas;
      sessionMetadata.feature_confidence = featureContext.confidence;
    }

    if (sessionId) {
      logCache("hit", "session", sessionName);
      // Update session metadata with current git state (fire-and-forget)
      logApiCall("sessions.update", "PUT", `metadata for ${sessionName}`);
      client.workspaces.sessions.update(workspaceId, sessionId, { metadata: sessionMetadata }).catch((e) => logHook("session-start", `Metadata update failed: ${e}`));
    } else {
      logCache("miss", "session", "fetching from Honcho");
      const startTime = Date.now();
      const session = await client.workspaces.sessions.getOrCreate(workspaceId, {
        id: sessionName,
        metadata: sessionMetadata,
      });
      sessionId = session.id;
      setCachedSessionId(cwd, sessionName, sessionId);
      logApiCall("sessions.getOrCreate", "POST", sessionName, Date.now() - startTime, true);
      logCache("write", "session", sessionId.slice(0, 8));
    }

    // Step 3: Get or create peers (use cache if available)
    let userPeerId = getCachedPeerId(config.peerName);
    let claudePeerId = getCachedPeerId(config.claudePeer);

    if (userPeerId) {
      logCache("hit", "peer", config.peerName);
    }
    if (claudePeerId) {
      logCache("hit", "peer", config.claudePeer);
    }

    const peerPromises: Promise<any>[] = [];
    if (!userPeerId) {
      logCache("miss", "peer", config.peerName);
      peerPromises.push(
        client.workspaces.peers.getOrCreate(workspaceId, { id: config.peerName }).then((p) => {
          userPeerId = p.id;
          setCachedPeerId(config.peerName, p.id);
          logCache("write", "peer", config.peerName);
        })
      );
    }
    if (!claudePeerId) {
      logCache("miss", "peer", config.claudePeer);
      peerPromises.push(
        client.workspaces.peers.getOrCreate(workspaceId, { id: config.claudePeer }).then((p) => {
          claudePeerId = p.id;
          setCachedPeerId(config.claudePeer, p.id);
          logCache("write", "peer", config.claudePeer);
        })
      );
    }
    if (peerPromises.length > 0) {
      const startTime = Date.now();
      await Promise.all(peerPromises);
      logApiCall("peers.getOrCreate", "POST", `${peerPromises.length} peers`, Date.now() - startTime, true);
    }

    // Step 4: Set session peers (fire-and-forget)
    client.workspaces.sessions.peers
      .set(workspaceId, sessionId, {
        [config.peerName]: { observe_me: true, observe_others: false },
        [config.claudePeer]: { observe_me: false, observe_others: true },
      })
      .catch((e) => logHook("session-start", `Set peers failed: ${e}`));

    // Store session mapping
    if (!getSessionForPath(cwd)) {
      setSessionForPath(cwd, sessionName);
    }

    // Upload git changes as observations (fire-and-forget)
    // These capture external activity that happened OUTSIDE of Claude sessions
    if (gitChanges.length > 0 && userPeerId) {
      const gitObservations = gitChanges
        .filter((c) => c.type !== "initial") // Don't log initial state as observation
        .map((change) => ({
          content: `[Git External] ${change.description}`,
          metadata: {
            type: "git_change",
            change_type: change.type,
            from: change.from,
            to: change.to,
            external: true, // Mark as external activity (not from Claude)
          },
        }));

      if (gitObservations.length > 0) {
        Promise.all(
          gitObservations.map((obs) =>
            client.workspaces.sessions.messages.create(workspaceId, sessionId, {
              peer_id: userPeerId!,
              is_user: true,
              content: obs.content,
              metadata: obs.metadata,
            })
          )
        ).catch((e) => logHook("session-start", `Git observations upload failed: ${e}`));
      }
    }

    // Step 5: PARALLEL fetch all context (the big optimization!)
    spinner.update("Fetching memory context");
    logAsync("context-fetch", "Starting 5 parallel context fetches");
    const contextParts: string[] = [];

    // Header with git context
    let headerContent = `## Honcho Memory System Active
- User: ${config.peerName}
- AI: ${config.claudePeer}
- Workspace: ${config.workspace}
- Session: ${sessionName}
- Directory: ${cwd}`;

    if (currentGitState) {
      headerContent += `\n- Git Branch: ${currentGitState.branch}`;
      headerContent += `\n- Git HEAD: ${currentGitState.commit}`;
      if (currentGitState.isDirty) {
        headerContent += `\n- Working Tree: ${currentGitState.dirtyFiles.length} uncommitted changes`;
      }
    }

    // Add inferred feature context to header
    if (featureContext && featureContext.confidence !== "low") {
      headerContent += `\n- Feature: ${featureContext.type} - ${featureContext.description}`;
      if (featureContext.areas.length > 0) {
        headerContent += `\n- Areas: ${featureContext.areas.join(", ")}`;
      }
    }

    contextParts.push(headerContent);

    // Add inferred feature context section
    if (featureContext) {
      const featureSection = [
        `## Inferred Feature Context`,
        `- Type: ${featureContext.type}`,
        `- Description: ${featureContext.description}`,
      ];
      if (featureContext.keywords.length > 0) {
        featureSection.push(`- Keywords: ${featureContext.keywords.join(", ")}`);
      }
      if (featureContext.areas.length > 0) {
        featureSection.push(`- Code Areas: ${featureContext.areas.join(", ")}`);
      }
      featureSection.push(`- Confidence: ${featureContext.confidence}`);
      contextParts.push(featureSection.join("\n"));
    }

    // Add git changes section if external changes detected
    if (gitChanges.length > 0) {
      const changeDescriptions = gitChanges.map((c) => `- ${c.description}`).join("\n");
      contextParts.push(`## Git Activity Since Last Session\n${changeDescriptions}`);
    }

    // Load local claude context immediately (instant, no API call)
    const localClaudeContext = loadClaudeLocalContext();
    if (localClaudeContext) {
      contextParts.push(`## CLAUDE Local Context (What I Was Working On)\n${localClaudeContext.slice(0, 2000)}`);
    }

    // Build context-aware dialectic queries
    const branchContext = currentGitState ? ` They are currently on git branch '${currentGitState.branch}'.` : "";
    const changeContext = gitChanges.length > 0 && gitChanges[0].type === "branch_switch"
      ? ` Note: they just switched branches from '${gitChanges[0].from}' to '${gitChanges[0].to}'.`
      : "";
    const featureHint = featureContext && featureContext.confidence !== "low"
      ? ` Current work appears to be: ${featureContext.type} - ${featureContext.description}.`
      : "";

    // Parallel API calls for rich context
    const fetchStart = Date.now();
    const [userContextResult, claudeContextResult, summariesResult, userChatResult, claudeChatResult] =
      await Promise.allSettled([
        // 1. Get user's context (SESSION-SCOPED for relevance)
        client.workspaces.peers.getContext(workspaceId, userPeerId!, {
          max_observations: 25,
          include_most_derived: true,
          session_name: sessionName,  // Scope to current project/session
        }),
        // 2. Get claude's context (self-awareness, also session-scoped)
        client.workspaces.peers.getContext(workspaceId, claudePeerId!, {
          max_observations: 15,
          include_most_derived: true,
          session_name: sessionName,  // Scope to current project/session
        }),
        // 3. Get session summaries
        client.workspaces.sessions.summaries(workspaceId, sessionId),
        // 4. Dialectic: Ask about user (context-enhanced)
        client.workspaces.peers.chat(workspaceId, userPeerId!, {
          query: `Summarize what you know about ${config.peerName} in 2-3 sentences. Focus on their preferences, current projects, and working style.${branchContext}${changeContext}${featureHint}`,
          session_id: sessionId,
        }),
        // 5. Dialectic: Ask about claude (self-reflection, context-enhanced)
        client.workspaces.peers.chat(workspaceId, claudePeerId!, {
          query: `What has ${config.claudePeer} been working on recently?${branchContext}${featureHint} Summarize the AI assistant's recent activities and focus areas relevant to the current work context.`,
          session_id: sessionId,
        }),
      ]);

    // Log async results
    const fetchDuration = Date.now() - fetchStart;
    const asyncResults = [
      { name: "peers.getContext(user)", success: userContextResult.status === "fulfilled" },
      { name: "peers.getContext(claude)", success: claudeContextResult.status === "fulfilled" },
      { name: "sessions.summaries", success: summariesResult.status === "fulfilled" },
      { name: "peers.chat(user)", success: userChatResult.status === "fulfilled" },
      { name: "peers.chat(claude)", success: claudeChatResult.status === "fulfilled" },
    ];
    const successCount = asyncResults.filter(r => r.success).length;
    logAsync("context-fetch", `Completed: ${successCount}/5 succeeded in ${fetchDuration}ms`, asyncResults);

    // ========== CONSOLIDATED CONTEXT OUTPUT ==========
    // Reduced from 6+ overlapping sections to 2-3 focused sections
    // (as recommended in FEEDBACK-FROM-CLAUDE.md)

    // Section 1: User Profile + Key Facts (CONSOLIDATED)
    // Combines: peer_card, explicit facts, deductive insights
    // Skips redundant "AI Summary" dialectic if we have good facts
    if (userContextResult.status === "fulfilled" && userContextResult.value) {
      const context = userContextResult.value;
      setCachedUserContext(context); // Cache for user-prompt hook
      logCache("write", "userContext", `${context.representation?.explicit?.length || 0} facts`);

      const userSection: string[] = [];

      // Profile as a compact line (not a whole section)
      if (context.peer_card && context.peer_card.length > 0) {
        userSection.push(context.peer_card.join("\n"));
      }

      // Add key facts (session-scoped, so should be relevant)
      if (context.representation) {
        const repText = formatRepresentation(context.representation);
        if (repText) {
          userSection.push(repText);
        }
      }

      if (userSection.length > 0) {
        contextParts.push(`## ${config.peerName}'s Profile\n${userSection.join("\n\n")}`);
      }
    }

    // Section 2: Recent Work (CONSOLIDATED)
    // Combines: claude facts, session summary, self-reflection
    // Prioritizes concrete work items over vague summaries
    if (claudeContextResult.status === "fulfilled" && claudeContextResult.value) {
      const context = claudeContextResult.value;
      setCachedClaudeContext(context); // Cache
      logCache("write", "claudeContext", `${context.representation?.explicit?.length || 0} facts`);

      if (context.representation) {
        const repText = formatRepresentation(context.representation);
        if (repText) {
          contextParts.push(`## ${config.claudePeer}'s Work History (Self-Context)\n${repText}`);
        }
      }
    }

    // Session summary - only include SHORT summary (skip Extended History to reduce noise)
    if (summariesResult.status === "fulfilled" && summariesResult.value) {
      const s = summariesResult.value as any;
      if (s.short_summary?.content) {
        contextParts.push(`## Recent Session Summary\n${s.short_summary.content}`);
      }
      // Skip long_summary - it overlaps with facts and adds too many tokens
    }

    // AI dialectic summaries - only include if facts are sparse
    // These cost $0.03 each but often overlap with facts we already have
    const hasGoodUserFacts = (userContextResult.status === "fulfilled" &&
      (userContextResult.value?.representation?.explicit?.length || 0) >= 5);
    const hasGoodClaudeFacts = (claudeContextResult.status === "fulfilled" &&
      (claudeContextResult.value?.representation?.explicit?.length || 0) >= 3);

    // Only show AI Summary if we don't have enough facts
    if (!hasGoodUserFacts && userChatResult.status === "fulfilled" && userChatResult.value?.content) {
      contextParts.push(`## AI Summary of ${config.peerName}\n${userChatResult.value.content}`);
    }

    // Only show AI Self-Reflection if we don't have enough claude facts
    if (!hasGoodClaudeFacts && claudeChatResult.status === "fulfilled" && claudeChatResult.value?.content) {
      contextParts.push(`## AI Self-Reflection (What ${config.claudePeer} Has Been Doing)\n${claudeChatResult.value.content}`);
    }

    // Stop spinner and display pixel art
    spinner.stop();

    logFlow("complete", `Memory loaded: ${contextParts.length} sections, ${successCount}/5 API calls succeeded`);

    // Display Honcho pixel character with startup message
    console.log(displayHonchoStartup("Honcho Memory"));

    // Output all context
    console.log(`\n[${config.claudePeer}/Honcho Memory Loaded]\n\n${contextParts.join("\n\n")}`);
    process.exit(0);
  } catch (error) {
    logHook("session-start", `Error: ${error}`, { error: String(error) });
    spinner.fail("memory load failed");
    console.error(`[honcho] ${error}`);
    process.exit(1);
  }
}
