import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, setSessionForPath, getHonchoClientOptions } from "../config.js";
import { basename } from "path";
import {
  setCachedUserContext,
  setCachedClaudeContext,
  loadClaudeLocalContext,
  resetMessageCount,
  setClaudeInstanceId,
  getCachedGitState,
  setCachedGitState,
  detectGitChanges,
} from "../cache.js";
import { Spinner } from "../spinner.js";
import { displayHonchoStartup } from "../pixel.js";
import { captureGitState, getRecentCommits, isGitRepo, inferFeatureContext } from "../git.js";
import { logHook, logApiCall, logCache, logFlow, logAsync, setLogContext } from "../log.js";


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

    // New SDK: workspace is provided at construction time
    const honcho = new Honcho(getHonchoClientOptions(config));

    // Step 1-3: Get session and peers using new fluent API (lazily created)
    spinner.update("Loading session");
    const sessionName = getSessionName(cwd);

    const startTime = Date.now();
    // New SDK: session() and peer() are async and create lazily
    const [session, userPeer, claudePeer] = await Promise.all([
      honcho.session(sessionName),
      honcho.peer(config.peerName),
      honcho.peer(config.claudePeer),
    ]);
    logApiCall("honcho.session/peer", "GET", `session + 2 peers`, Date.now() - startTime, true);

    // Step 4: Set session peer configuration (fire-and-forget)
    // New SDK uses session.setPeerConfiguration()
    Promise.all([
      session.setPeerConfiguration(userPeer, { observeMe: true, observeOthers: false }),
      session.setPeerConfiguration(claudePeer, { observeMe: false, observeOthers: true }),
    ]).catch((e) => logHook("session-start", `Set peers failed: ${e}`));

    // Store session mapping
    if (!getSessionForPath(cwd)) {
      setSessionForPath(cwd, sessionName);
    }

    // Upload git changes as observations (fire-and-forget)
    // These capture external activity that happened OUTSIDE of Claude sessions
    if (gitChanges.length > 0) {
      const gitObservations = gitChanges
        .filter((c) => c.type !== "initial") // Don't log initial state as observation
        .map((change) =>
          userPeer.message(`[Git External] ${change.description}`, {
            metadata: {
              type: "git_change",
              change_type: change.type,
              from: change.from,
              to: change.to,
              external: true,
            },
          })
        );

      if (gitObservations.length > 0) {
        session.addMessages(gitObservations).catch((e) =>
          logHook("session-start", `Git observations upload failed: ${e}`)
        );
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
        userPeer.context({
          maxConclusions: 25,
          includeMostFrequent: true,
        }),
        // 2. Get claude's context (self-awareness, also session-scoped)
        claudePeer.context({
          maxConclusions: 15,
          includeMostFrequent: true,
        }),
        // 3. Get session summaries
        session.summaries(),
        // 4. Dialectic: Ask about user (context-enhanced)
        userPeer.chat(
          `Summarize what you know about ${config.peerName} in 2-3 sentences. Focus on their preferences, current projects, and working style.${branchContext}${changeContext}${featureHint}`,
          { session }
        ),
        // 5. Dialectic: Ask about claude (self-reflection, context-enhanced)
        claudePeer.chat(
          `What has ${config.claudePeer} been working on recently?${branchContext}${featureHint} Summarize the AI assistant's recent activities and focus areas relevant to the current work context.`,
          { session }
        ),
      ]);

    // Log async results
    const fetchDuration = Date.now() - fetchStart;
    const asyncResults = [
      { name: "peer.context(user)", success: userContextResult.status === "fulfilled" },
      { name: "peer.context(claude)", success: claudeContextResult.status === "fulfilled" },
      { name: "session.summaries", success: summariesResult.status === "fulfilled" },
      { name: "peer.chat(user)", success: userChatResult.status === "fulfilled" },
      { name: "peer.chat(claude)", success: claudeChatResult.status === "fulfilled" },
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
      const context = userContextResult.value as any;
      setCachedUserContext(context); // Cache for user-prompt hook
      const rep = context.representation;
      logCache("write", "userContext", `${rep?.explicit?.length || 0} facts`);

      const userSection: string[] = [];

      // Profile as a compact line (not a whole section)
      // New SDK may use peerCard instead of peer_card
      const peerCard = context.peerCard || context.peer_card;
      if (peerCard && peerCard.length > 0) {
        userSection.push(peerCard.join("\n"));
      }

      // Add key facts (session-scoped, so should be relevant)
      if (rep) {
        const repText = formatRepresentation(rep);
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
      const context = claudeContextResult.value as any;
      setCachedClaudeContext(context); // Cache
      const rep = context.representation;
      logCache("write", "claudeContext", `${rep?.explicit?.length || 0} facts`);

      if (rep) {
        const repText = formatRepresentation(rep);
        if (repText) {
          contextParts.push(`## ${config.claudePeer}'s Work History (Self-Context)\n${repText}`);
        }
      }
    }

    // Session summary - only include SHORT summary (skip Extended History to reduce noise)
    if (summariesResult.status === "fulfilled" && summariesResult.value) {
      const s = summariesResult.value as any;
      // New SDK may use shortSummary instead of short_summary
      const shortSummary = s.shortSummary || s.short_summary;
      if (shortSummary?.content) {
        contextParts.push(`## Recent Session Summary\n${shortSummary.content}`);
      }
      // Skip long_summary - it overlaps with facts and adds too many tokens
    }

    // AI dialectic summaries - always include when available
    // Chat result may be a string or {content: string}
    const userChatContent = userChatResult.status === "fulfilled"
      ? (typeof userChatResult.value === "string" ? userChatResult.value : (userChatResult.value as any)?.content)
      : null;
    if (userChatContent) {
      contextParts.push(`## AI Summary of ${config.peerName}\n${userChatContent}`);
    }

    const claudeChatContent = claudeChatResult.status === "fulfilled"
      ? (typeof claudeChatResult.value === "string" ? claudeChatResult.value : (claudeChatResult.value as any)?.content)
      : null;
    if (claudeChatContent) {
      contextParts.push(`## AI Self-Reflection (What ${config.claudePeer} Has Been Doing)\n${claudeChatContent}`);
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
