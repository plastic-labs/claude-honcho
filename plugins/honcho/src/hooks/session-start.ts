import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionForPath, setSessionForPath, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, readStdinText, getObservationMode, getInjectionConfig } from "../config.js";
import { renderSessionStart } from "../injection.js";
import {
  setCachedSessionId,
  resetMessageCount,
  setClaudeInstanceId,
  getCachedGitState,
  setCachedGitState,
  detectGitChanges,
} from "../cache.js";
import { Spinner } from "../spinner.js";
import { setMemoryState, setSessionLink } from "../state.js";
import { honchoSessionUrl } from "../styles.js";
import { captureGitState } from "../git.js";
import { logHook, logApiCall, logFlow, logAsync, setLogContext } from "../log.js";
import { verboseApiResult, verboseList, clearVerboseLog, visComposedInjection } from "../visual.js";


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
    const input = getCachedStdin() ?? await readStdinText();
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

  // Update git state cache
  if (currentGitState) {
    setCachedGitState(cwd, currentGitState);
  }

  // Start loading animation with session name visible in the spinner message
  const spinner = new Spinner({ style: "neural" });
  spinner.start(`${sessionName} · loading memory`);
  setMemoryState("loading", sessionName, claudeInstanceId);
  setSessionLink(honchoSessionUrl(config.workspace, sessionName), sessionName, claudeInstanceId);

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
    if (config.saveGitEvents === true && gitChanges.length > 0) {
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

    // Step 5: Fetch only what the configured session-start components need —
    // the SDK long summary and/or the context() representation + peer card.
    // Nothing is cached here; the per-turn hook does its own fresh,
    // prompt-scoped fetch, so a session with no context components pays for no
    // context round-trip.
    spinner.update(`${sessionName} · fetching context`);

    const injection = getInjectionConfig(config);
    const startComponents = injection.sessionStart;
    const wantSummary = startComponents.includes("summary");
    const wantContext =
      startComponents.includes("peerCard") || startComponents.includes("peerRepresentation");

    logAsync("context-fetch", `Starting context fetch${wantSummary ? " + summary" : ""}`);

    const fetchStart = Date.now();

    // unified: user observes self — use userPeer, no target.
    // directional: aiPeer observes user — use aiPeer with target.
    const contextLabel = observationMode === "unified" ? "userPeer.context()" : "aiPeer.context(target=user)";
    const [userContextResult, summaryResult] = await Promise.allSettled([
      wantContext
        ? (observationMode === "unified"
            ? userPeer.context({ maxConclusions: 25, includeMostFrequent: true })
            : aiPeer.context({ target: config.peerName, maxConclusions: 25, includeMostFrequent: true }))
        : Promise.resolve(null),
      wantSummary ? session.summaries() : Promise.resolve(null),
    ]);

    const fetchDuration = Date.now() - fetchStart;
    const asyncResults = [
      ...(wantContext ? [{ name: contextLabel, success: userContextResult.status === "fulfilled" }] : []),
      ...(wantSummary ? [{ name: "session.summaries()", success: summaryResult.status === "fulfilled" }] : []),
    ];
    const successCount = asyncResults.filter(r => r.success).length;
    logAsync("context-fetch", `Fetched ${successCount}/${asyncResults.length} in ${fetchDuration}ms`, asyncResults);

    // Verbose output (file-based — ~/.honcho/verbose.log)
    if (userContextResult.status === "fulfilled" && userContextResult.value) {
      const ctx = userContextResult.value as any;
      verboseApiResult(`${contextLabel} → representation`, ctx.representation);
      verboseList(`${contextLabel} → peerCard`, ctx.peerCard);
    }

    // Compose the configured session-start injection. Default [] renders to an
    // empty payload — nothing injected at session start.
    const contextValue = userContextResult.status === "fulfilled" ? (userContextResult.value as any) : null;
    const summaryValue = summaryResult.status === "fulfilled" ? (summaryResult.value as any) : null;
    const rendered = renderSessionStart(startComponents, {
      summary: summaryValue?.longSummary?.content ?? null,
      peerCard: contextValue?.peerCard ?? null,
      representation: contextValue?.representation ?? null,
      remember: config.rememberTool === true,
    });

    // Stop the spinner before any stdout write — a live spinner would corrupt
    // the hook's JSON and leave UI artifacts.
    spinner.stop();
    setMemoryState("idle", undefined, claudeInstanceId);

    if (rendered.content) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: `[Honcho Memory for ${config.peerName}]: ${rendered.content}`,
        },
        systemMessage: visComposedInjection("session-start", rendered.labels),
      }));
    }

    logFlow("complete", `Cache warmed: ${successCount}/1 context · injected: ${rendered.labels.join(", ") || "none"}`);
    process.exit(0);
  } catch (error) {
    logHook("session-start", `Error: ${error}`, { error: String(error) });
    spinner.stop();
    setMemoryState("idle", undefined, claudeInstanceId);
    process.exit(0);
  }
}
