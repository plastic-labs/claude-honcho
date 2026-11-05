import { Honcho } from "@honcho-ai/sdk";
import { initHook, loadConfig, getSessionName, isPluginEnabled, getCachedStdin, readStdinText, getObservationMode, getInjectionConfig, getAuthNotice } from "../config.js";
import { createHonchoClient } from "../honcho-client.js";
import { renderSessionStart } from "../injection.js";
import {
  resetMessageCount,
  getCachedGitState,
  setCachedGitState,
  detectGitChanges,
} from "../cache.js";
import { Spinner } from "../spinner.js";
import { setMemoryState, setSessionLink } from "../state.js";
import { honchoSessionUrl } from "../styles.js";
import { captureGitState, getSessionScopes } from "../git.js";
import { logHook, logApiCall, logFlow, logAsync, setLogContext } from "../log.js";
import { verboseList, clearVerboseLog, visComposedInjection } from "../visual.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  source?: string;
  workspace_roots?: string[];
}

// This hook runs synchronously, so these fetches block startup. Bound them
// well under the 30s hook ceiling so a slow server degrades to an empty
// injection instead of a hung session start.
const CARD_FETCH_TIMEOUT_MS = 10000;

/** Resolve a promise with its value, or null if `ms` elapses or it rejects. */
function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function handleSessionStart(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(JSON.stringify({ systemMessage: "[honcho] Not configured. Run /honcho:setup to connect Honcho memory." }));
    process.exit(0);
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

  // Set log context early so all logs include cwd/session
  const sessionName = getSessionName(claudeInstanceId);
  setLogContext(cwd, sessionName ?? undefined);
  if (!sessionName) {
    logHook("session-start", "No Claude Code session id; skipping");
    process.exit(0);
  }

  // A resumed conversation already carries its session-start injection; only
  // the local session bookkeeping is refreshed.
  const source = hookInput.source ?? "startup";
  if (source === "resume") {
    setSessionLink(honchoSessionUrl(config, sessionName), sessionName, claudeInstanceId);
    logHook("session-start", "Resumed conversation; skipping injection");
    process.exit(0);
  }

  // Compaction continues the same conversation: keep the verbose log and the
  // first-prompt counter. Startup and clear begin a new one.
  if (source !== "compact") {
    clearVerboseLog();
    resetMessageCount();
  }

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
  setSessionLink(honchoSessionUrl(config, sessionName), sessionName, claudeInstanceId);

  try {
    logHook("session-start", `Starting session in ${cwd}`, { branch: currentGitState?.branch });
    logFlow("init", `workspace: ${config.workspace}, peers: ${config.peerName}/${config.aiPeer}`);

    // New SDK: workspace is provided at construction time
    const honcho = await createHonchoClient(config);

    // Step 1-3: Get session and peers using new fluent API (lazily created)
    spinner.update(`${sessionName} · loading session`);

    const startTime = Date.now();
    // New SDK: session() and peer() are async and create lazily
    // Scopes are attached when the chat starts, while the session is empty;
    // re-attaching after compaction would queue a backfill of its messages.
    const scopes = getSessionScopes(cwd);
    const [session, userPeer, aiPeer] = await Promise.all([
      source === "compact" ? honcho.session(sessionName) : honcho.session(sessionName, { scopes }),
      honcho.peer(config.peerName),
      honcho.peer(config.aiPeer),
    ]);
    logApiCall("honcho.session/peer", "GET", `session + 2 peers`, Date.now() - startTime, true);

    // Step 4: Add peers to session (materializes session server-side).
    // Peer defaults (observeMe, observeOthers) are managed server-side —
    // configure them via API or on app.honcho.dev. We only override observeOthers
    // for the AI peer in directional mode so it can observe the user.
    const observationMode = getObservationMode(config);
    const peers: Parameters<typeof session.addPeers>[0] = observationMode === "directional"
      ? [userPeer, [aiPeer, { observeOthers: true }]]
      : [userPeer, aiPeer];
    await session.addPeers(peers);

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

    // Step 5: Fetch the peer card if it's selected. No context() call: the rest
    // of memory is recalled on demand through the chat tool.
    spinner.update(`${sessionName} · fetching peer card`);

    const startComponents = getInjectionConfig(config).sessionStart;
    const wantCard = startComponents.includes("peerCard");

    const fetchStart = Date.now();
    // unified: the user's own card; directional: the AI peer's card of the user.
    const cardLabel = observationMode === "unified" ? "userPeer.getCard()" : "aiPeer.getCard(target=user)";
    const peerCard = wantCard
      ? await raceTimeout(
          (observationMode === "unified" ? userPeer.getCard() : aiPeer.getCard(config.peerName)).then((c) => c ?? []),
          CARD_FETCH_TIMEOUT_MS
        )
      : null;
    if (wantCard) {
      logAsync("card-fetch", `${cardLabel} ${peerCard ? "ok" : "unavailable"} in ${Date.now() - fetchStart}ms`);
      verboseList(`${cardLabel} → peerCard`, peerCard ?? undefined);
    }

    const rendered = renderSessionStart(startComponents, {
      peerCard: wantCard ? peerCard : undefined,
      scopes,
      remember: config.rememberTool === true,
    });

    // Stop the spinner before any stdout write — a live spinner would corrupt
    // the hook's JSON and leave UI artifacts.
    spinner.stop();
    setMemoryState("idle", undefined, claudeInstanceId);

    const authNotice = getAuthNotice(config);
    const systemMessage = [authNotice, visComposedInjection("session-start", rendered.labels, rendered.notes)]
      .filter(Boolean)
      .join("\n") || undefined;
    if (rendered.content) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: `[Honcho Memory for ${config.peerName}]: ${rendered.content}`,
        },
        systemMessage,
      }));
    } else if (rendered.notes.length || authNotice) {
      console.log(JSON.stringify({ systemMessage }));
    }

    logFlow("complete", `injected: ${rendered.labels.join(", ") || "none"}`);
    process.exit(0);
  } catch (error) {
    logHook("session-start", `Error: ${error}`, { error: String(error) });
    spinner.stop();
    setMemoryState("idle", undefined, claudeInstanceId);
    const authNotice = getAuthNotice(config);
    if (authNotice) console.log(JSON.stringify({ systemMessage: authNotice }));
    process.exit(0);
  }
}

/** Entry point: reads stdin once, then runs the handler. */
export async function main(): Promise<void> {
  await initHook();
  await handleSessionStart();
}
