import type { Honcho } from "@honcho-ai/sdk";
import { initHook, loadConfig, getSessionName, getCachedStdin, readStdinText, getAuthNotice, migrateConfig, type HonchoCLAUDEConfig } from "../config.js";
import { isLiveSession, recordLiveSession } from "../skills/backfill.js";
import { createHonchoClient } from "../honcho-client.js";
import { renderSessionStart } from "../injection.js";
import { resetMessageCount } from "../cache.js";
import { Spinner } from "../spinner.js";
import { setMemoryState, setSessionLink } from "../state.js";
import { honchoSessionUrl } from "../styles.js";
import { getSessionScopes } from "../git.js";
import { logHook, logApiCall, logFlow, logAsync, setLogContext } from "../log.js";
import { clearVerboseLog, visComposedInjection } from "../visual.js";


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

/**
 * Get or create this chat's session (joining `scopes`, when given) and add both
 * peers, and record the chat as saved live so /honcho import leaves it alone.
 */
async function joinSession(honcho: Honcho, config: HonchoCLAUDEConfig, sessionName: string, scopes?: string[]) {
  const [session, userPeer, aiPeer] = await Promise.all([
    scopes ? honcho.session(sessionName, { scopes }) : honcho.session(sessionName),
    honcho.peer(config.peerName),
    honcho.peer(config.aiPeer),
  ]);
  // Observation uses Honcho's defaults: both peers observe themselves only.
  await session.addPeers([userPeer, aiPeer]);
  recordLiveSession(config.workspace, sessionName);
  return { session, userPeer };
}

export async function handleSessionStart(): Promise<void> {
  const migrated = await migrateConfig();
  const config = loadConfig();
  if (!config) {
    console.log(JSON.stringify({ systemMessage: "[honcho] Not configured. Run /honcho setup to connect Honcho memory." }));
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
  // the local session bookkeeping is refreshed. A chat no session start of this
  // version recorded (it predates the upgrade, or its start failed) has no
  // Honcho session yet, so that is created with its scopes.
  const source = hookInput.source ?? "startup";
  if (source === "resume") {
    setSessionLink(honchoSessionUrl(config, sessionName), sessionName, claudeInstanceId);
    if (!isLiveSession(config.workspace, sessionName)) {
      try {
        await joinSession(await createHonchoClient(config), config, sessionName, getSessionScopes(cwd));
      } catch (error) {
        logHook("session-start", `Could not set up the resumed session: ${error}`, { error: String(error) });
      }
    }
    logHook("session-start", "Resumed conversation; skipping injection");
    process.exit(0);
  }

  // Compaction continues the same conversation: keep the verbose log and the
  // first-prompt counter. Startup and clear begin a new one.
  if (source !== "compact") {
    clearVerboseLog();
    resetMessageCount();
  }

  // Start loading animation with session name visible in the spinner message
  const spinner = new Spinner({ style: "neural" });
  spinner.start(`${sessionName} · loading memory`);
  setMemoryState("loading", sessionName, claudeInstanceId);
  setSessionLink(honchoSessionUrl(config, sessionName), sessionName, claudeInstanceId);

  try {
    logHook("session-start", `Starting session in ${cwd}`);
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
    const { userPeer } = await joinSession(honcho, config, sessionName, source === "compact" ? undefined : scopes);
    logApiCall("honcho.session/peer", "GET", `session + 2 peers`, Date.now() - startTime, true);

    // Step 5: Fetch the peer card. No context() call: the rest of memory is
    // recalled on demand through the chat tool.
    spinner.update(`${sessionName} · fetching peer card`);

    const fetchStart = Date.now();
    const peerCard = await raceTimeout(userPeer.getCard().then((c) => c ?? []), CARD_FETCH_TIMEOUT_MS);
    logAsync("card-fetch", `userPeer.getCard() ${peerCard ? `ok (${peerCard.length} items)` : "unavailable"} in ${Date.now() - fetchStart}ms`);

    const rendered = renderSessionStart({ peerCard, scopes });

    // Stop the spinner before any stdout write — a live spinner would corrupt
    // the hook's JSON and leave UI artifacts.
    spinner.stop();
    setMemoryState("idle", undefined, claudeInstanceId);

    const authNotice = [migrated, getAuthNotice(config)].filter(Boolean).join("\n");
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
    const authNotice = [migrated, getAuthNotice(config)].filter(Boolean).join("\n");
    if (authNotice) console.log(JSON.stringify({ systemMessage: authNotice }));
    process.exit(0);
  }
}

/** Entry point: reads stdin once, then runs the handler. */
export async function main(): Promise<void> {
  await initHook();
  await handleSessionStart();
}
