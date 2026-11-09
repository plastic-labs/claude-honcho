import { initHook, loadConfig, getSessionName, getCachedStdin, readStdinText } from "../config.js";
import { clearSessionFiles } from "../state.js";
import { logHook, setLogContext } from "../log.js";


interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  reason?: string;
  workspace_roots?: string[];
}

/**
 * SessionEnd hook — must return instantly. On /exit the harness aborts slow
 * hooks and surfaces "SessionEnd hook failed: Hook cancelled", so nothing here
 * touches the network. Messages upload live from the other hooks, and the old
 * [Session ended] marker only ever derived lifecycle exhaust ("claude's
 * session ended at ...") — write-only telemetry, never read back.
 */
export async function handleSessionEnd(): Promise<void> {
  const config = loadConfig();
  if (!config) {
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
  const sessionName = getSessionName(hookInput.session_id);

  setLogContext(cwd, sessionName ?? undefined);
  logHook("session-end", `Session ending`, { reason });

  clearSessionFiles(hookInput.session_id);
  logHook("session-end", "Session ended — no upload (messages saved live)");
  process.exit(0);
}

/** Entry point: reads stdin once, then runs the handler. */
export async function main(): Promise<void> {
  await initHook();
  await handleSessionEnd();
}
