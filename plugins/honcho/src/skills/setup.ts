import { readFileSync } from "fs";
import { isCloud } from "@honcho-ai/harness-plugin-core";
import {
  loadConfig,
  loadConfigFromEnv,
  saveConfig,
  getConfigPath,
  configExists,
  setDetectedHost,
  saveHostApiKey,
  describeAuth,
  getConfiguredOrigin,
  type HonchoCLAUDEConfig,
} from "../config.js";
import { createHonchoClient } from "../honcho-client.js";
import { checkSignIn, startSignIn } from "./login.js";
import { findTranscripts } from "./transcript-parse.js";

type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; status?: string };

/** True when the config file holds nothing but sign-in credentials. */
function configHasOnlyGrants(): boolean {
  try {
    const file = JSON.parse(readFileSync(getConfigPath(), "utf-8"));
    const hosts = file.hosts ?? {};
    return Object.keys(file).every((k) => k === "hosts" || k === "oauth")
      && Object.values<any>(hosts).every((b) => Object.keys(b ?? {}).every((k) => k === "oauth" || k === "apiKey"));
  } catch {
    return false;
  }
}

async function validate(config: HonchoCLAUDEConfig): Promise<string | null> {
  try {
    await (await createHonchoClient(config)).workspaces();
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|auth|invalid api key/i.test(msg)) {
      return config.auth?.source === "oauth" ? "Your Honcho sign-in was rejected. Sign in again." : "That API key was rejected.";
    }
    return `Could not reach Honcho: ${msg.slice(0, 200)}`;
  }
}

/** Validate the credential and write the config on first run. */
async function finish(config: HonchoCLAUDEConfig): Promise<Reply> {
  const problem = await validate(config);
  if (problem) return { ok: false, error: problem };
  if (!configExists() || configHasOnlyGrants()) {
    // An OAuth access token is never written as apiKey; it lives in its grant.
    if (config.auth?.source === "env") saveHostApiKey(config.apiKey);
    saveConfig(config);
  }
  return { ok: true, ...(await state()) };
}

/** Whether Honcho is connected, and which ways to connect are open. */
export async function state(): Promise<Record<string, unknown>> {
  setDetectedHost("claude_code");
  const config = loadConfig() || loadConfigFromEnv();
  let transcripts = 0;
  try { transcripts = findTranscripts(30).length; } catch { /* optional */ }
  return {
    connected: !!config,
    canSignIn: isCloud(getConfiguredOrigin()),
    auth: config ? describeAuth(config) : null,
    workspace: config?.workspace ?? null,
    peer: config?.peerName ?? null,
    transcripts,
  };
}

export async function connectExisting(): Promise<Reply> {
  setDetectedHost("claude_code");
  const config = loadConfig() || loadConfigFromEnv();
  return config ? finish(config) : { ok: false, error: "Not connected." };
}

export async function beginSignIn(): Promise<Reply> {
  try {
    return { ok: true, ...(await startSignIn()) };
  } catch (e) {
    return { ok: false, error: `Could not start sign-in: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function pollSignIn(): Promise<Reply> {
  setDetectedHost("claude_code");
  const status = await checkSignIn();
  if (status !== "approved") return { ok: true, status };
  const config = loadConfig();
  if (!config) return { ok: false, error: "Signed in, but the config could not be read." };
  return { ...(await finish(config)), status };
}

/** Save an API key typed into the pane; put back the old value if it doesn't work. */
export async function saveApiKey(key: string): Promise<Reply> {
  setDetectedHost("claude_code");
  key = key.trim();
  if (!key) return { ok: false, error: "Enter an API key." };
  let previous: string | undefined;
  try { previous = JSON.parse(readFileSync(getConfigPath(), "utf-8")).hosts?.claude_code?.apiKey; } catch { /* no config yet */ }
  saveHostApiKey(key);
  const config = loadConfig();
  const problem = config ? await validate(config) : "Could not read the config.";
  if (problem) {
    saveHostApiKey(previous);
    return { ok: false, error: problem };
  }
  return finish(config!);
}
