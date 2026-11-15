import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import {
  checkConfig,
  claudeHonchoReader,
  configPath,
  effectiveBlock,
  ensureFreshCredential,
  migrateHost,
  pickCredential,
  readConfigFile,
  resolveConfig,
  saveHost,
  telemetryHeaders,
  DEFAULT_BASE_URL,
  type Credential,
  type Env,
} from "@honcho-ai/harness-plugin-core";
import { getLocalContext, localSessionName, setLocalConfigContext, type LocalContext } from "./local-config.js";

/** How 0.3.4 and earlier read the file; an unmigrated block is read and migrated through it. */
const LEGACY = claudeHonchoReader;

export function sanitizeForSessionName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

// ============================================
// Host Detection
// ============================================

export type HonchoHost = "cursor" | "claude_code" | "obsidian";

let _detectedHost: HonchoHost | null = null;

export function setDetectedHost(host: HonchoHost): void {
  _detectedHost = host;
}

export function getDetectedHost(): HonchoHost {
  return _detectedHost ?? "claude_code";
}

export function detectHost(stdinInput?: Record<string, unknown>): HonchoHost {
  // Explicit env var override (used by install scripts and external tooling)
  const envHost = process.env.HONCHO_HOST;
  if (envHost === "cursor" || envHost === "claude_code" || envHost === "obsidian") return envHost;

  if (stdinInput?.cursor_version) return "cursor";
  // Cursor sets CURSOR_PROJECT_DIR for child processes (incl. Claude Code inside Cursor)
  if (process.env.CURSOR_PROJECT_DIR) return "cursor";
  return "claude_code";
}

const DEFAULT_WORKSPACE: Record<HonchoHost, string> = {
  "cursor": "cursor",
  "claude_code": "claude_code",
  "obsidian": "obsidian",
};

const DEFAULT_AI_PEER: Record<HonchoHost, string> = {
  "cursor": "cursor",
  "claude_code": "claude",
  "obsidian": "honcho",
};

// Stdin cache: entry points read stdin once via initHook(),
// handlers consume from cache via getCachedStdin().
let _stdinText: string | null = null;

export function cacheStdin(text: string): void {
  _stdinText = text;
}

export function getCachedStdin(): string | null {
  return _stdinText;
}

/** Runtime-agnostic stdin read (hooks run under bun in dev, node when bundled). */
export async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Shared hook entry point initialization.
 * Reads stdin once, caches it, detects host, and exits early for unsupported hosts.
 * Must be called at the top of every hook entry point before the handler.
 */
export async function initHook(): Promise<void> {
  const stdinText = await readStdinText();
  cacheStdin(stdinText);
  let input: Record<string, unknown> = {};
  try { input = JSON.parse(stdinText || "{}"); } catch { process.exit(0); }
  if (input.cursor_version) process.exit(0);
  setDetectedHost(detectHost(input));

  // Repo-local .honcho/config.json for this hook's working directory (none: no-op),
  // found from the same cwd the handlers use.
  const roots = input.workspace_roots;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const cwd = text(Array.isArray(roots) ? roots[0] : undefined) || text(input.cwd) || process.cwd();
  setLocalConfigContext(cwd, getDetectedHost());
  // A project that turned Honcho off: no hook does anything there.
  if (!isHonchoEnabled()) process.exit(0);
}

// ============================================
// Config (~/.honcho/config.json, read and written through harness-plugin-core)
// ============================================

/** Resolved runtime config consumed by all other code. */
export interface HonchoCLAUDEConfig {
  /** The user's peer name */
  peerName: string;
  /** Honcho API key or OAuth access token, whichever pickCredential chose */
  apiKey: string;
  /** Where apiKey came from, and the state of an OAuth grant */
  auth?: Omit<Credential, "token"> & { host: string };
  workspace: string;
  aiPeer: string;
  /** Honcho API origin (Honcho cloud unless the host block sets baseUrl) */
  baseUrl: string;
  /** Set when a repo-local .honcho/config.json overlaid this config (see local-config.ts). */
  localConfig?: {
    path: string;
    /** The credential is the repo-local file's apiKey (never refreshed or written back). */
    credential: boolean;
  };
}

export function getConfigPath(): string {
  return configPath();
}

export function getConfigDir(): string {
  return dirname(configPath());
}

export function configExists(): boolean {
  return existsSync(configPath());
}

/**
 * The plugin's own version, read from plugin.json — the same source the
 * version-check script uses. Returns "unknown" when the manifest can't be
 * located, so callers never advertise a stale hardcoded number.
 */
export function getPluginVersion(): string {
  // CLAUDE_PLUGIN_ROOT when the host sets it; otherwise one hop up from this
  // module, which holds in both layouts (src/ in dev, the dist/ chunk bundled).
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const candidates = [
    ...(root ? [join(root, ".claude-plugin", "plugin.json")] : []),
    fileURLToPath(new URL("../.claude-plugin/plugin.json", import.meta.url)),
  ];
  for (const manifest of candidates) {
    try {
      const version = (JSON.parse(readFileSync(manifest, "utf-8")) as { version?: unknown }).version;
      if (typeof version === "string" && version) return version;
    } catch {
      // Try the next candidate
    }
  }
  return "unknown";
}

/** `HONCHO_ENDPOINT` from 0.3.4 and earlier as a base URL: `local` is a local Honcho, a URL is used as is. */
function legacyEndpoint(value: string | undefined): string | undefined {
  if (value === "local") return "http://localhost:8000";
  if (value?.startsWith("http")) return value.replace(/\/v3\/?$/, "");
  return undefined;
}

/**
 * Env vars that 0.3.4 and earlier read only when there was no config file:
 * `HONCHO_ENDPOINT` for the server and `HONCHO_CLAUDE_PEER` (`HONCHO_CURSOR_PEER`
 * for Cursor) for the AI peer. Each stands in for its newer var while that var
 * is unset and this host's block has neither that setting nor a credential of
 * its own, so a config file someone set up still wins, as it did then.
 * Returns newer var → [old var, value].
 */
export function legacyEnv(host: HonchoHost = getDetectedHost()): Record<string, [string, string]> {
  const env = process.env;
  const peerVar = host === "cursor" ? "HONCHO_CURSOR_PEER" : "HONCHO_CLAUDE_PEER";
  // [newer var, the block setting it fills, old var, value]
  const candidates: [string, string, string, string | undefined][] = [
    ["HONCHO_BASE_URL", "baseUrl", "HONCHO_ENDPOINT", legacyEndpoint(env.HONCHO_ENDPOINT)],
    ["HONCHO_AI_PEER", "aiPeer", peerVar, env[peerVar] || undefined],
  ];
  const set = candidates.filter(([newVar, , , value]) => value && !env[newVar]);
  if (!set.length) return {};
  const block = effectiveBlock(readConfigFile(), host, LEGACY);
  if (block.apiKey || block.oauth) return {};
  return Object.fromEntries(
    set.filter(([, setting]) => !block[setting]).map(([newVar, , oldVar, value]) => [newVar, [oldVar, value as string]])
  );
}

/** process.env, with the `legacyEnv` vars standing in for their newer names. */
function honchoEnv(host: HonchoHost): Env {
  const legacy = Object.entries(legacyEnv(host));
  if (!legacy.length) return process.env;
  return { ...process.env, ...Object.fromEntries(legacy.map(([k, [, value]]) => [k, value])) };
}

function resolveHost(host: HonchoHost) {
  return resolveConfig(readConfigFile(), {
    host,
    env: honchoEnv(host),
    defaults: { workspace: DEFAULT_WORKSPACE[host], aiPeer: DEFAULT_AI_PEER[host] },
    legacy: LEGACY,
  });
}

/**
 * False when `logging: false` or `HONCHO_LOGGING=false` (from 0.3.4 and earlier)
 * turned the logs in ~/.honcho off. Read as those versions read it: the env var,
 * then hosts.<host> (also spelled with `-`, which migration leaves in place
 * beside the new block), then the top level.
 */
export function isLoggingEnabled(host: HonchoHost = getDetectedHost()): boolean {
  if (process.env.HONCHO_LOGGING === "false") return false;
  const file = readConfigFile();
  const hosts = file.hosts && typeof file.hosts === "object" ? file.hosts : {};
  const own = [hosts[host], hosts[host.replace(/_/g, "-")]]
    .map((block) => (block && typeof block === "object" ? block.logging : undefined))
    .find((v) => v !== undefined);
  return (own ?? file.logging) !== false;
}

/**
 * This host's config, or null when it has no credential. A repo-local
 * .honcho/config.json registered for this process overlays the global one.
 */
export function loadConfig(host: HonchoHost = getDetectedHost()): HonchoCLAUDEConfig | null {
  return loadConfigFor(getLocalContext(), host);
}

/** loadConfig() under a given repo-local config (null: the global config alone). */
export function loadConfigFor(local: LocalContext | null, host: HonchoHost = getDetectedHost()): HonchoCLAUDEConfig | null {
  return local ? loadLocalConfig(host, local) : loadGlobalConfig(host);
}

/** This host's config from ~/.honcho/config.json alone, ignoring any repo-local config. */
export function loadGlobalConfig(host: HonchoHost = getDetectedHost()): HonchoCLAUDEConfig | null {
  const cfg = resolveHost(host);
  const cred = pickCredential(readConfigFile(), { host, baseUrl: cfg.baseUrl, env: honchoEnv(host), legacy: LEGACY });
  if (!cred) return null;
  const { token, ...authState } = cred;
  return {
    apiKey: token,
    auth: { ...authState, host },
    peerName: cfg.peerName,
    workspace: cfg.workspace,
    aiPeer: cfg.aiPeer,
    baseUrl: cfg.baseUrl,
  };
}

/**
 * Write this host's settings to its block. Values that only came from env
 * vars, and defaults, are not written, except `field`: the setting the user
 * just set is always written, even while an env var overrides it.
 * A value that came from a repo-local config is never written to the global file.
 */
export async function saveConfig(
  config: HonchoCLAUDEConfig,
  field?: "peerName" | "workspace" | "aiPeer" | "baseUrl",
): Promise<void> {
  const host = getDetectedHost();
  config = withoutLocalValues(config, host);
  const env = honchoEnv(host);
  const write = (key: typeof field, envVar: string) => key === field || !env[envVar];
  const patch: Record<string, string | undefined> = {};
  if (write("peerName", "HONCHO_PEER_NAME")) patch.peerName = config.peerName;
  if (write("workspace", "HONCHO_WORKSPACE")) patch.workspace = config.workspace === DEFAULT_WORKSPACE[host] ? undefined : config.workspace;
  if (write("aiPeer", "HONCHO_AI_PEER")) patch.aiPeer = config.aiPeer === DEFAULT_AI_PEER[host] ? undefined : config.aiPeer;
  if (write("baseUrl", "HONCHO_BASE_URL")) patch.baseUrl = config.baseUrl === DEFAULT_BASE_URL ? undefined : config.baseUrl;
  await saveHost(configPath(), host, patch, LEGACY);
}

/** Set or clear this host's API key (setup pane). */
export async function saveHostApiKey(key: string | undefined): Promise<void> {
  await saveHost(configPath(), getDetectedHost(), { apiKey: key }, LEGACY);
}

/** The API origin this plugin targets, even when no credential is configured yet. */
export function getConfiguredOrigin(host: HonchoHost = getDetectedHost()): string {
  const local = getLocalContext();
  return local ? localSettingsFor(host, local).baseUrl : resolveHost(host).baseUrl;
}

/** Problems in the config file that affect this host. */
export function getConfigIssues(host: HonchoHost = getDetectedHost()): string[] {
  return checkConfig(readConfigFile())
    .filter((i) => i.path === "schemaVersion" || (i.path === "hosts" && i.message.includes(host)))
    .map((i) => i.message);
}

/**
 * Keys this plugin wrote to its block in earlier versions and no longer reads.
 * Not `logging`: that stays as an off switch (see isLoggingEnabled).
 */
const DEAD_HOST_KEYS = [
  "sessionStrategy", "sessionPeerPrefix", "sessions", "injection", "contextRefresh", "messageUpload",
  "reasoningLevel", "statusline", "saveToolUse", "saveGitEvents", "redactPatterns", "rememberTool",
  "observationMode", "saveMessages", "enabled", "globalOverride", "linkedHosts",
];

/**
 * Move an older config's settings into this host's block (top-level apiKey,
 * peerName, baseUrl; old key names; dead keys). Leaves the top level and other
 * hosts alone. Returns a one-line notice when it changed something.
 */
export async function migrateConfig(host: HonchoHost = getDetectedHost()): Promise<string | undefined> {
  try {
    const changed = await migrateHost(configPath(), host, DEAD_HOST_KEYS, LEGACY);
    if (changed.length) return `[honcho] Moved your Honcho settings into hosts.${host} in ~/.honcho/config.json.`;
  } catch {
    // Never block a session on this; the next one tries again.
  }
  return undefined;
}

export function getClaudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

/** Honcho session for a Claude Code chat: the Claude Code session id itself.
 *  Hooks pass hookInput.session_id; the MCP server and skills read
 *  CLAUDE_CODE_SESSION_ID, which Claude Code sets for its child processes. */
export function getSessionName(sessionId?: string): string | null {
  // A repo-local config can put every chat in the project into one session.
  const pinned = localSessionName(getLocalContext());
  if (pinned) return sanitizeForSessionName(pinned);
  return getChatSessionName(sessionId);
}

/** The Honcho session name of the Claude Code chat itself, ignoring any repo-local pin. */
export function getChatSessionName(sessionId?: string): string | null {
  const id = sessionId || process.env.CLAUDE_CODE_SESSION_ID;
  return id ? sanitizeForSessionName(id) : null;
}

/** Host keys present in the config file. */
export function getKnownHosts(): string[] {
  const hosts = readConfigFile().hosts;
  return hosts && typeof hosts === "object" ? Object.keys(hosts) : [];
}

export interface HonchoClientOptions {
  apiKey: string;
  baseURL: string;
  workspaceId: string;
  timeout?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

/**
 * Refresh an OAuth access token that is near expiry and put the result in
 * config.apiKey. A no-op for API keys. Every refresh supersedes the previous
 * access token, so long-lived callers run this before each batch of requests
 * instead of holding on to a token.
 */
export async function refreshCredential(config: HonchoCLAUDEConfig): Promise<void> {
  // A repo-local apiKey is the credential as written; the global grant must not replace it.
  if (config.localConfig?.credential) return;
  const host = config.auth?.host ?? getDetectedHost();
  const cred = await ensureFreshCredential({ path: configPath(), host, baseUrl: config.baseUrl, env: honchoEnv(host as HonchoHost), legacy: LEGACY });
  if (!cred) return;
  const { token, ...authState } = cred;
  config.apiKey = token;
  config.auth = { ...authState, host };
}

/** One line describing which credential is in use, for status output. */
export function describeAuth(config: HonchoCLAUDEConfig): string {
  const a = config.auth;
  const expiry = () => {
    if (!a?.expiresAt) return "";
    const mins = Math.round((a.expiresAt - Date.now() / 1000) / 60);
    return mins > 0 ? ` (token refreshes in ${mins}m)` : " (token expired)";
  };
  if (config.localConfig?.credential) return `API key from ${config.localConfig.path}`;
  switch (a?.source) {
    case "env": return "HONCHO_API_KEY env var";
    case "oauth": return `signed in with Honcho${expiry()}`;
    default: return "API key";
  }
}

/** A user-facing notice when the OAuth sign-in needs attention, else undefined. */
export function getAuthNotice(config: HonchoCLAUDEConfig): string | undefined {
  if (config.auth?.reauthRequired) {
    return "[honcho] Your Honcho sign-in has expired. Run /honcho setup to sign in again.";
  }
  return undefined;
}

/** Get the base URL for a resolved runtime config. */
export function getHonchoBaseUrl(config: HonchoCLAUDEConfig): string {
  return `${config.baseUrl}/v3`;
}

/** Client identity headers (`X-Honcho-Host`, `X-Honcho-Plugin`) for telemetry attribution. */
export function getTelemetryHeaders(host: HonchoHost = getDetectedHost()): Record<string, string> {
  return telemetryHeaders({
    host: host.replace(/_/g, "-"),
    plugin: "claude-honcho",
    pluginVersion: getPluginVersion(),
  });
}

export function getHonchoClientOptions(config: HonchoCLAUDEConfig): HonchoClientOptions {
  return {
    apiKey: config.apiKey,
    baseURL: getHonchoBaseUrl(config),
    workspaceId: config.workspace,
    timeout: 120000,
    maxRetries: 1,
    defaultHeaders: getTelemetryHeaders(),
  };
}

/** Whether the config targets Honcho cloud, the API app.honcho.dev shows. */
export function isProductionEndpoint(config: HonchoCLAUDEConfig): boolean {
  return config.baseUrl === DEFAULT_BASE_URL;
}

export function getEndpointInfo(config: HonchoCLAUDEConfig): { type: string; url: string } {
  return { type: isProductionEndpoint(config) ? "production" : "custom", url: config.baseUrl };
}

// ============================================
// Repo-local config overlay (see local-config.ts)
// ============================================

type OverlayField = "peerName" | "workspace" | "aiPeer" | "baseUrl";
const OVERLAY_FIELDS: readonly OverlayField[] = ["peerName", "workspace", "aiPeer", "baseUrl"];
const OVERLAY_ENV: Record<OverlayField, string> = {
  peerName: "HONCHO_PEER_NAME",
  workspace: "HONCHO_WORKSPACE",
  aiPeer: "HONCHO_AI_PEER",
  baseUrl: "HONCHO_BASE_URL",
};

/**
 * This host's settings with a repo-local config on top. Precedence, highest
 * first: HONCHO_* env var, the repo-local file, the global file, defaults.
 */
function localSettingsFor(host: HonchoHost, local: LocalContext): Record<OverlayField, string> {
  const env = honchoEnv(host);
  const global = resolveHost(host);
  const out = {} as Record<OverlayField, string>;
  for (const key of OVERLAY_FIELDS) {
    out[key] = env[OVERLAY_ENV[key]] ? global[key] : local.settings[key] ?? global[key];
  }
  return out;
}

/** loadConfig() for a project with a repo-local config. */
function loadLocalConfig(host: HonchoHost, local: LocalContext): HonchoCLAUDEConfig | null {
  const env = honchoEnv(host);
  const settings = localSettingsFor(host, local);
  // The repo's own apiKey, unless HONCHO_API_KEY overrides it as it overrides any
  // configured key; otherwise the global credential for the server in use.
  const ownKey = !env.HONCHO_API_KEY && local.settings.apiKey;
  const cred: Credential | null = ownKey
    ? { token: ownKey, source: "apiKey" }
    : pickCredential(readConfigFile(), { host, baseUrl: settings.baseUrl, env, legacy: LEGACY });
  if (!cred) return null;
  const { token, ...authState } = cred;
  return {
    apiKey: token,
    auth: { ...authState, host },
    ...settings,
    localConfig: { path: local.path, credential: !!ownKey },
  };
}

/**
 * `config` with every value that came from the repo-local config put back to
 * its global value, so saveConfig() never copies a project's override into
 * ~/.honcho/config.json. A value the caller changed is kept.
 */
function withoutLocalValues(config: HonchoCLAUDEConfig, host: HonchoHost): HonchoCLAUDEConfig {
  const local = getLocalContext();
  if (!local) return config;
  const global = resolveHost(host);
  const out = { ...config };
  for (const key of OVERLAY_FIELDS) {
    const own = local.settings[key];
    if (own !== undefined && out[key] === own) out[key] = global[key];
  }
  delete out.localConfig;
  return out;
}

/** Settings this project's repo-local config overrides (empty without one). */
export function getLocalOverrides(): OverlayField[] {
  const local = getLocalContext();
  return local ? OVERLAY_FIELDS.filter((k) => local.settings[k] !== undefined) : [];
}

/** False when this project's repo-local config sets `enabled: false`. */
export function isHonchoEnabled(): boolean {
  return getLocalContext()?.settings.enabled !== false;
}

/** False when this project's repo-local config sets `saveMessages: false` (or `enabled: false`). */
export function isMessageSavingEnabled(): boolean {
  const s = getLocalContext()?.settings;
  return s?.enabled !== false && s?.saveMessages !== false;
}
