import { Honcho, Session, Peer } from "@honcho-ai/sdk";
import { loadConfig, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, readStdinText } from "../config.js";
import { getInstanceIdForCwd, chunkForIngestion, addMessagesBatched } from "../cache.js";
import { logHook, logApiCall, setLogContext } from "../log.js";
import { isHarnessInjected, isTerseReply } from "./user-prompt.js";

interface HookInput {
  prompt?: string;
  cwd?: string;
  session_id?: string;
  workspace_roots?: string[];
}

/**
 * Async UserPromptSubmit companion to user-prompt.ts: persists the user's
 * prompt to Honcho off the turn's critical path.
 *
 * This runs as a separate `async: true` hook so the write never blocks the
 * model's response. It's the write half of UserPromptSubmit; user-prompt.ts is
 * the read half (context/dialectic injection), which stays synchronous because
 * its additionalContext must reach the model before it answers this turn.
 *
 * Being async, it runs detached — it awaits the upload to completion here
 * rather than racing process exit, so a slow POST still lands.
 */
export async function handleSaveUserMessage(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

  if (!isPluginEnabled() || config.saveMessages === false) {
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
  if (!prompt.trim()) {
    process.exit(0);
  }

  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);

  setLogContext(cwd, sessionName);

  if (isHarnessInjected(prompt)) {
    logHook("save-user-message", "Skipping upload (harness-injected content, not user input)");
    process.exit(0);
  }

  try {
    await postUserMessage(config, prompt, instanceId || undefined, sessionName);
  } catch (e) {
    logHook("save-user-message", `Upload failed: ${e}`);
  }

  process.exit(0);
}

// Upload a user prompt. SessionStart already created the session/peers, so we
// use local handles with a noEnsure stub to skip the get-or-create round-trip,
// falling back to a real lookup only if the direct POST fails.
async function postUserMessage(
  config: any,
  prompt: string,
  instanceId: string | undefined,
  sessionName: string,
): Promise<void> {
  const honcho = new Honcho(getHonchoClientOptions(config));
  const noEnsure = () => Promise.resolve();

  const userPeer = new Peer(config.peerName, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
  const createdAt = new Date().toISOString();
  const configuration = isTerseReply(prompt) ? { reasoning: { enabled: false } } : undefined;
  const messages = chunkForIngestion(prompt).map((chunk) =>
    userPeer.message(chunk, {
      createdAt,
      metadata: {
        instance_id: instanceId || undefined,
        session_affinity: sessionName,
      },
      ...(configuration ? { configuration } : {}),
    })
  );

  logApiCall("session.addMessages", "POST", `user prompt (${prompt.length} chars, ${messages.length} msg, direct)`);
  const session = new Session(sessionName, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
  await addMessagesBatched(session, messages, (e) => {
    logHook("save-user-message", `Direct upload failed, retrying via get-or-create: ${e}`);
    return honcho.session(sessionName);
  });
}
