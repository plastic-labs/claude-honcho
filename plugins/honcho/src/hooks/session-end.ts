import { loadConfig, getSessionName, isPluginEnabled, getCachedStdin, readStdinText } from "../config.js";
import { getInstanceIdForCwd } from "../cache.js";
import { clearSessionFiles, getMessageSaveCount } from "../state.js";
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
 * Counts real user turns in the transcript. Deliberately a local copy of
 * stop.ts's isRealUserPrompt rather than an import: this hook must return
 * instantly, and importing stop.js would pull in the Honcho SDK at load time.
 */
function countUserTurns(transcriptPath: string): number {
  if (!transcriptPath || !existsSync(transcriptPath)) return 0;
  let turns = 0;
  try {
    for (const line of readFileSync(transcriptPath, "utf-8").split("\n")) {
      if (!line.includes('"user"')) continue;
      try {
        const entry = JSON.parse(line);
        if ((entry.type || entry.role) !== "user" || entry.isMeta) continue;
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
  const saved = getMessageSaveCount(hookInput.session_id);
  const userTurns = countUserTurns(hookInput.transcript_path || "");
  clearSessionFiles(hookInput.session_id);

  if (saved > 0) {
    logHook("session-end", `Session ended — no upload (${saved} message(s) saved live)`);
  } else if (userTurns > 0) {
    logActivity(
      "error",
      "session-end",
      `Session ended — NOTHING SAVED: 0 messages uploaded despite ${userTurns} user turn(s). ` +
        `Live saving is broken — check that the UserPromptSubmit and Stop hooks still run ` +
        `(see hooks.json timeouts) and back-fill with /honcho:import if needed.`,
      { saved, userTurns },
    );
  } else {
    logHook("session-end", "Session ended — nothing to save (no user turns)");
  }
  process.exit(0);
}
