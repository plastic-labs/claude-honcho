import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, setSessionForPath, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, getObservationMode } from "../config.js";
import {
  setCachedUserContext,
  setCachedSessionId,
  resetMessageCount,
  setClaudeInstanceId,
  getCachedGitState,
  setCachedGitState,
  detectGitChanges,
} from "../cache.js";
import { Spinner } from "../spinner.js";
import { captureGitState, getRecentCommits, isGitRepo, inferFeatureContext } from "../git.js";
import { logHook, logApiCall, logCache, logFlow, logAsync, setLogContext } from "../log.js";
import { verboseApiResult, verboseList, clearVerboseLog } from "../visual.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  source?: string;
  workspace_roots?: string[];
}

export async function handleSessionStart(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("[honcho] Not configured. Run: honcho init");
    process.exit(1);
  }

  // Early exit if plugin is disabled
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
    // No input or invalid JSON
  }

  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const claudeInstanceId = hookInput.session_id;

  // Store Claude's instance ID for parallel session support
  // Global write kept for backward compat (post-tool-use, MCP server, etc.)
  if (claudeInstanceId) {
    setClaudeInstanceId(claudeInstanceId);
  }

  // Set log context early so all logs include cwd/session
  const sessionName = getSessionName(cwd, claudeInstanceId);
  setLogContext(cwd, sessionName);

  // Clear verbose log for fresh session
  clearVerboseLog();

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

  // Start loading animation with session name visible in the spinner message
  const spinner = new Spinner({ style: "neural" });
  spinner.start(`${sessionName} · loading memory`);

  try {
    logHook("session-start", `Starting session in ${cwd}`, { branch: currentGitState?.branch });
    logFlow("init", `workspace: ${config.workspace}, peers: ${config.peerName}/${config.aiPeer}`);

    // New SDK: workspace is provided at construction time
    const honcho = new Honcho(getHonchoClientOptions(config));

    // Step 1-3: Get session and peers using new fluent API (lazily created)
    spinner.update(`${sessionName} · loading session`);

    const startTime = Date.now();
    // New SDK: session() and peer() are async and create lazily
    const [session, userPeer, aiPeer] = await Promise.all([
      honcho.session(sessionName),
      honcho.peer(config.peerName),
      honcho.peer(config.aiPeer),
    ]);
    logApiCall("honcho.session/peer", "GET", `session + 2 peers`, Date.now() - startTime, true);

    // Write CWD to cache so MCP server can resolve the project directory
    // Also stores instanceId per-cwd to prevent cross-session collision
    setCachedSessionId(cwd, sessionName, session.id, claudeInstanceId);

    // Step 4: Add peers to session (materializes session server-side).
    // Peer defaults (observeMe, observeOthers) are managed server-side —
    // configure them via API or on app.honcho.dev. We only override observeOthers
    // for the AI peer in directional mode so it can observe the user.
    const observationMode = getObservationMode(config);
    const peers: Parameters<typeof session.addPeers>[0] = observationMode === "directional"
      ? [userPeer, [aiPeer, { observeOthers: true }]]
      : [userPeer, aiPeer];
    await session.addPeers(peers);

    // Only persist session names for per-directory strategy (stable names).
    // Dynamic strategies (git-branch, chat-instance) change per session,
    // so locking them as overrides defeats the purpose.
    if (!getSessionForPath(cwd) && (!config.sessionStrategy || config.sessionStrategy === "per-directory")) {
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

    // Step 5: Warm caches + trigger dialectic reasoning.
    // context() results are cached for user-prompt hook (sole injection point).
    // chat() triggers Honcho's dialectic engine — the results aren't displayed
    // but the reasoning feeds back into the knowledge graph.
    spinner.update(`${sessionName} · fetching context`);

    const branchContext = currentGitState ? ` on branch '${currentGitState.branch}'` : "";
    const featureHint = featureContext && featureContext.confidence !== "low"
      ? ` Working on: ${featureContext.type} - ${featureContext.description}.`
      : "";

    logAsync("context-fetch", "Starting context fetch + 2 dialectic fire-and-forget");

    const fetchStart = Date.now();
    const dialecticLevel = config.reasoningLevel ?? "low";

    // unified: user observes self — use userPeer, no target.
    // directional: aiPeer observes user — use aiPeer with target.
    const contextLabel = observationMode === "unified" ? "userPeer.context()" : "aiPeer.context(target=user)";
    const [userContextResult] = await Promise.allSettled([
      observationMode === "unified"
        ? userPeer.context({ maxConclusions: 25, includeMostFrequent: true })
        : aiPeer.context({ target: config.peerName, maxConclusions: 25, includeMostFrequent: true }),
    ]);

    // Dialectic: fire-and-forget. Results feed the knowledge graph;
    // we don't need them for cache or display.
    if (observationMode === "unified") {
      userPeer.chat(
        `Summarize what you know about ${config.peerName}. Focus on preferences, current projects, and working style.${branchContext}${featureHint}`,
        { session, reasoningLevel: dialecticLevel }
      ).catch((e) => logHook("session-start", `Dialectic (user) failed: ${e}`));

      userPeer.chat(
        `What has ${config.peerName} been working on recently?${branchContext}${featureHint} Summarize recent activities relevant to the current work.`,
        { session, reasoningLevel: dialecticLevel }
      ).catch((e) => logHook("session-start", `Dialectic (recent work) failed: ${e}`));
    } else {
      aiPeer.chat(
        `Summarize what you know about ${config.peerName}. Focus on preferences, current projects, and working style.${branchContext}${featureHint}`,
        { target: config.peerName, session, reasoningLevel: dialecticLevel }
      ).catch((e) => logHook("session-start", `Dialectic (user) failed: ${e}`));

      aiPeer.chat(
        `What has ${config.peerName} been working on recently?${branchContext}${featureHint} Summarize recent activities relevant to the current work.`,
        { target: config.peerName, session, reasoningLevel: dialecticLevel }
      ).catch((e) => logHook("session-start", `Dialectic (recent work) failed: ${e}`));
    }

    const fetchDuration = Date.now() - fetchStart;
    const asyncResults = [
      { name: contextLabel, success: userContextResult.status === "fulfilled" },
    ];
    const successCount = asyncResults.filter(r => r.success).length;
    logAsync("context-fetch", `Context: ${successCount}/1 succeeded in ${fetchDuration}ms (dialectic fire-and-forget)`, asyncResults);

    // Verbose output (file-based — ~/.honcho/verbose.log)
    if (userContextResult.status === "fulfilled" && userContextResult.value) {
      const ctx = userContextResult.value as any;
      verboseApiResult(`${contextLabel} → representation`, ctx.representation);
      verboseList(`${contextLabel} → peerCard`, ctx.peerCard);
    }

    // Cache results for user-prompt hook
    if (userContextResult.status === "fulfilled" && userContextResult.value) {
      const context = userContextResult.value as any;
      setCachedUserContext(context);
      const rep = context.representation;
      const count = typeof rep === "string" ? rep.split("\n").filter((l: string) => l.trim() && !l.startsWith("#")).length : 0;
      logCache("write", "userContext", `${count} conclusions`);
    }

    // Stop spinner; avoid stdout writes here to prevent UI artifacts.
    spinner.stop();

    logFlow("complete", `Cache warmed: ${successCount}/1 context + 2 dialectic (fire-and-forget)`);
    process.exit(0);
  } catch (error) {
    logHook("session-start", `Error: ${error}`, { error: String(error) });
    spinner.stop();
    process.exit(0);
  }
}
