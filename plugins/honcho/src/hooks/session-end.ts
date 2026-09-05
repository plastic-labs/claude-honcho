import { loadConfig, getSessionName, isPluginEnabled, getCachedStdin, readStdinText } from "../config.js";
import { getInstanceIdForCwd } from "../cache.js";
import { clearSessionFiles, getMessageSaveTally } from "../state.js";
import { logActivity, logHook, setLogContext } from "../log.js";
import { existsSync, readFileSync } from "fs";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  reason?: string;
  workspace_roots?: string[];
}

/**
 * Counts real user turns this window contributed to the transcript.
 * Deliberately a local copy of stop.ts's isRealUserPrompt rather than an
 * import: this hook must return instantly, and importing stop.js would pull
 * in the Honcho SDK at load time.
 */
function countUserTurns(transcriptPath: string, sessionId?: string): number {
  if (!transcriptPath || !existsSync(transcriptPath)) return 0;
  let turns = 0;
  try {
    for (const line of readFileSync(transcriptPath, "utf-8").split("\n")) {
      if (!line.includes('"user"')) continue;
      try {
        const entry = JSON.parse(line);
        if ((entry.type || entry.role) !== "user" || entry.isMeta) continue;
        // A resumed session carries the earlier window's turns in the same
        // transcript; those were saved (or lost) by that window, not this one.
        if (sessionId && entry.sessionId && entry.sessionId !== sessionId) continue;
        const mc = entry.message?.content ?? entry.content;
        const text =
          typeof mc === "string"
            ? mc
            : Array.isArray(mc)
              ? mc.filter((b: any) => b.type === "text" && b.text).map((b: any) => b.text).join("")
              : "";
        const trimmed = text.trim();
        if (trimmed.length > 0 && !trimmed.startsWith("<")) turns++;
      } catch {
        continue;
      }
    }
  } catch {
    return 0;
  }
  return turns;
}

/**
 * SessionEnd hook — must return instantly. On /exit the harness aborts slow
 * hooks and surfaces "SessionEnd hook failed: Hook cancelled", so nothing here
 * touches the network. Messages upload live from the other hooks, and the old
 * [Session ended] marker only ever derived lifecycle exhaust ("claude's
 * session ended at ...") — write-only telemetry, never read back.
 *
 * It does not upload, but it must not *claim* the live saves happened either:
 * when the saving hooks are dead (e.g. a sub-second hook timeout kills them),
 * the old unconditional "messages saved live" line turned total data loss into
 * a success message. So we compare what actually landed against the user turns
 * in the transcript and log an error when the two disagree.
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
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    // Continue with defaults
  }

  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const reason = hookInput.reason || "unknown";
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);

  setLogContext(cwd, sessionName);
  logHook("session-end", `Session ending`, { reason });

  // Read the tally before clearSessionFiles deletes it.
  const saved = getMessageSaveTally(hookInput.session_id);
  const userTurns = countUserTurns(hookInput.transcript_path || "", hookInput.session_id);
  clearSessionFiles(hookInput.session_id);

  if (config.saveMessages === false) {
    // Nothing was meant to land, so silence here is the configured outcome.
    logHook("session-end", "Session ended — no upload (message saving is disabled)");
  } else if (!hookInput.session_id) {
    // Without a session_id the upload hooks keep no tally, so there is nothing
    // to check against. Say so instead of reading a shared count.
    logHook("session-end", "Session ended — save validation unavailable (no session_id)");
  } else if (userTurns === 0) {
    logHook("session-end", "Session ended — nothing to save (no user turns)");
  } else if (saved.user === 0) {
    // Checked against the user tally alone: a successful Stop upload must not
    // vouch for the UserPromptSubmit hook, which fails independently.
    logActivity(
      "error",
      "session-end",
      `Session ended — NOTHING SAVED: 0 user message(s) uploaded despite ${userTurns} user turn(s) ` +
        `(${saved.assistant} assistant message(s) did land). ` +
        `Live saving is broken — check that the UserPromptSubmit and Stop hooks still run ` +
        `(see hooks.json timeouts) and back-fill with /honcho:import if needed.`,
      { saved, userTurns },
    );
  } else if (saved.user < userTurns) {
    // Not an error on its own: harness-injected turns are counted here but
    // deliberately skipped by the upload hook. Logged so a real gap is visible.
    logActivity(
      "flow",
      "session-end",
      `Session ended — ${saved.user} of ${userTurns} user turn(s) uploaded ` +
        `(${saved.assistant} assistant message(s) saved live)`,
      { saved, userTurns },
    );
  } else {
    logHook(
      "session-end",
      `Session ended — no upload (${saved.user} user + ${saved.assistant} assistant message(s) saved live)`,
    );
  }
  process.exit(0);
}
