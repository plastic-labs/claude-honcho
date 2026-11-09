import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { initHook, loadConfig, getSessionName, getCachedStdin, readStdinText } from "../config.js";
import { getMessageCount, incrementMessageCount } from "../cache.js";
import { logHook, setLogContext } from "../log.js";
import { honchoSessionUrl } from "../styles.js";
import { setSessionLink, isModActive, setNotice } from "../state.js";

interface HookInput {
  prompt?: string;
  cwd?: string;
  session_id?: string;
  workspace_roots?: string[];
}

function formatSessionLink(sessionUrl: string): string {
  return `view your session in honcho GUI: ${sessionUrl}`;
}

function readVersionNag(): string | undefined {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) return undefined;
  const flag = join(dataDir, ".version-stale");
  if (!existsSync(flag)) return undefined;
  try {
    return readFileSync(flag, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * UserPromptSubmit hook — read-only and makes no Honcho calls. Memory is not
 * injected per turn; the model recalls it by calling the chat tool. This hook
 * only records the session link and shows the one-off banners (version nag,
 * session link). The prompt upload is the separate save-user-message hook.
 */
export async function handleUserPrompt(): Promise<void> {
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
    process.exit(0);
  }

  const prompt = hookInput.prompt || "";
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const sessionName = getSessionName(hookInput.session_id);

  setLogContext(cwd, sessionName ?? undefined);
  if (!sessionName) {
    logHook("user-prompt", "No Claude Code session id; skipping");
    process.exit(0);
  }

  if (!prompt.trim()) {
    process.exit(0);
  }

  const sessionUrl = honchoSessionUrl(config, sessionName);
  setSessionLink(sessionUrl, sessionName, hookInput.session_id);

  const messageCountBefore = getMessageCount();
  incrementMessageCount();

  // The mod shows the link in its pane and the nag as a toast.
  if (isModActive()) {
    const nag = messageCountBefore === 0 ? readVersionNag() : undefined;
    if (nag && hookInput.session_id) setNotice(nag, hookInput.session_id);
    process.exit(0);
  }

  // Stagger the one-off banners so the first prompt isn't crowded. The
  // version-update nag (if stale) takes the first message and bumps the GUI
  // session link to the second; with no nag, the link shows on the first.
  // The nag flag is written at SessionStart and stable for the session, so
  // its presence on message 2 tells us the link hasn't been shown yet.
  const nag = readVersionNag();
  const link = sessionUrl ? formatSessionLink(sessionUrl) : undefined;
  const banner =
    messageCountBefore === 0
      ? nag ?? link
      : messageCountBefore === 1 && nag
        ? link
        : undefined;

  if (banner) console.log(JSON.stringify({ systemMessage: banner }));
  process.exit(0);
}

/** Entry point: reads stdin once, then runs the handler. */
export async function main(): Promise<void> {
  await initHook();
  await handleUserPrompt();
}
