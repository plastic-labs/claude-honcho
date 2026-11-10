import { readFileSync } from "fs";
import { isCloud, readConfigFile, suggestPeerName } from "@honcho-ai/harness-plugin-core";
import {
  loadConfig,
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
    if (config.auth?.source === "env") await saveHostApiKey(config.apiKey);
  }
  return { ok: true, ...(await state()) };
}

/** Whether Honcho is connected, and which ways to connect are open. */
export async function state(): Promise<Record<string, unknown>> {
  setDetectedHost("claude_code");
  const config = loadConfig();
  let transcripts = 0;
  try { transcripts = findTranscripts(30).length; } catch { /* optional */ }
  const file = readConfigFile();
  const hosts: Record<string, { peerName?: string }> = file.hosts ?? {};
  const others = Object.entries(hosts)
    .filter(([h, b]) => h !== "claude_code" && typeof b?.peerName === "string")
    .map(([h, b]) => ({ host: h, peerName: b.peerName as string }));
  return {
    connected: !!config,
    canSignIn: isCloud(getConfiguredOrigin()),
    hasName: typeof hosts.claude_code?.peerName === "string" || !!process.env.HONCHO_PEER_NAME,
    suggestedName: suggestPeerName(file),
    others,
    auth: config ? describeAuth(config) : null,
    workspace: config?.workspace ?? null,
    peer: config?.peerName ?? null,
    transcripts,
  };
}

export async function connectExisting(): Promise<Reply> {
  setDetectedHost("claude_code");
  const config = loadConfig();
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

/** Save the name Honcho knows the user by. */
export async function saveName(name: string): Promise<Reply> {
  setDetectedHost("claude_code");
  name = name.trim();
  if (!name) return { ok: false, error: "Enter a name." };
  const config = loadConfig();
  if (!config) return { ok: false, error: "Not connected." };
  await saveConfig({ ...config, peerName: name });
  return { ok: true, ...(await state()) };
}

/** Save an API key typed into the pane; put back the old value if it doesn't work. */
export async function saveApiKey(key: string): Promise<Reply> {
  setDetectedHost("claude_code");
  key = key.trim();
  if (!key) return { ok: false, error: "Enter an API key." };
  let previous: string | undefined;
  try { previous = JSON.parse(readFileSync(getConfigPath(), "utf-8")).hosts?.claude_code?.apiKey; } catch { /* no config yet */ }
  await saveHostApiKey(key);
  const config = loadConfig();
  const problem = config ? await validate(config) : "Could not read the config.";
  if (problem) {
    await saveHostApiKey(previous);
    return { ok: false, error: problem };
  }
  return finish(config!);
}
