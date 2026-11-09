import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { ensureFreshCredential, pickCredential, telemetryHeaders, type Credential, type OAuthTokens } from "@honcho-ai/harness-plugin-core";

export function sanitizeForSessionName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

const HONCHO_CLOUD_URL = "https://api.honcho.dev/v3";

// ============================================
// Host Detection
// ============================================

export type HonchoHost = "cursor" | "claude_code" | "obsidian";

export interface HostConfig {
  /** The user's peer name */
  peerName?: string;
  /** Honcho workspace name for this host */
  workspace?: string;
  /** AI peer name for this host (e.g. "claude", "cursor") */
  aiPeer?: string;
  /**
   * Honcho API key for this host. HONCHO_API_KEY overrides it.
   */
  apiKey?: string;
  /** OAuth grant from this plugin's device sign-in (/honcho setup). */
  oauth?: OAuthTokens;

  /** Honcho API URL (default: Honcho cloud) */
  baseUrl?: string;
}

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

export function getDefaultWorkspace(host?: HonchoHost): string {
  return DEFAULT_WORKSPACE[host ?? getDetectedHost()];
}

export function getDefaultAiPeer(host?: HonchoHost): string {
  return DEFAULT_AI_PEER[host ?? getDetectedHost()];
}

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
}

// ============================================
// Config Types
// ============================================

/** Raw shape of ~/.honcho/config.json on disk */
interface HonchoFileConfig {
  apiKey?: string;
  peerName?: string;
  workspace?: string;
  aiPeer?: string;
  /** Honcho API URL (default: Honcho cloud) */
  baseUrl?: string;
  hosts?: Record<string, HostConfig>;
  /** Removed. Still read so session start can flag the workspace it used to pick. */
  globalOverride?: boolean;
  // Legacy flat fields (read-only fallbacks when no hosts block)
  cursorPeer?: string;
  claudePeer?: string;
}

/** Resolved runtime config consumed by all other code.
 *  Host-specific fields (workspace, aiPeer) are resolved from the hosts block
 *  or legacy flat fields in HonchoFileConfig. */
export interface HonchoCLAUDEConfig {
  /** The user's peer name */
  peerName: string;
  /** Honcho API key or OAuth access token, whichever pickCredential chose */
  apiKey: string;
  /** Where apiKey came from, and the state of an OAuth grant */
  auth?: Omit<Credential, "token"> & { host: string };
  /** Honcho workspace name (resolved per-host) */
  workspace: string;
  /** AI peer name (resolved per-host, e.g. "claude" for claude-code) */
  aiPeer: string;

  /** Honcho API URL (default: Honcho cloud) */
  baseUrl?: string;
  /** Workspace a removed `globalOverride: true` would have used, when it differs */
  legacyWorkspace?: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) {
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

const CONFIG_DIR = join(homedir(), ".honcho");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
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

/**
 * Load config from file, with environment variable fallbacks.
 * Host-specific fields are resolved from the hosts block in the config file.
 */
export function loadConfig(host?: HonchoHost): HonchoCLAUDEConfig | null {
  const resolvedHost = host ?? getDetectedHost();

  if (configExists()) {
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const raw = JSON.parse(content) as HonchoFileConfig;
      return resolveConfig(raw, resolvedHost);
    } catch {
      // Fall through to env-only config
    }
  }
  return loadConfigFromEnv(resolvedHost);
}

function resolveConfig(raw: HonchoFileConfig, host: HonchoHost): HonchoCLAUDEConfig | null {
  const hostBlock = raw.hosts?.[host]
    ?? raw.hosts?.[host.replace(/_/g, "-")]
    ?? raw.hosts?.[host.replace(/-/g, "_")];

  // Resolution order: env var > this plugin's OAuth grant > apiKey
  // (host-scoped, then root) > an expired grant. OAuth only on Honcho cloud.
  const hostKey = [host, host.replace(/_/g, "-"), host.replace(/-/g, "_")].find((k) => raw.hosts?.[k]) ?? host;
  const cred = pickCredential(raw, {
    host: hostKey,
    baseUrl: honchoOrigin(hostBlock?.baseUrl ?? raw.baseUrl),
    env: process.env,
  });
  if (!cred) return null;
  const { token: apiKey, ...authState } = cred;

  // This host's peerName, else the legacy root one, else one another host
  // already uses, so plugins sharing a workspace stay one peer.
  const otherHostPeer = Object.values(raw.hosts ?? {}).find((b) => b?.peerName)?.peerName;
  const peerName = hostBlock?.peerName || raw.peerName || otherHostPeer
    || process.env.HONCHO_PEER_NAME || process.env.USER || process.env.USERNAME || "user";

  // Resolve host-specific fields
  let workspace: string;
  let aiPeer: string;

  if (hostBlock) {
    // Host-specific block takes precedence
    workspace = hostBlock.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = hostBlock.aiPeer ?? DEFAULT_AI_PEER[host];
  } else {
    // Legacy flat-field fallback for configs written before hosts block.
    // Env var is respected here (matching main-branch behavior) so it gets
    // captured into the hosts block on first saveConfig(), after which the
    // env var becomes redundant and is safely ignored.
    workspace = process.env.HONCHO_WORKSPACE ?? raw.workspace ?? DEFAULT_WORKSPACE[host];
    if (host === "cursor") {
      aiPeer = raw.cursorPeer ?? DEFAULT_AI_PEER["cursor"];
    } else {
      aiPeer = raw.claudePeer ?? DEFAULT_AI_PEER["claude_code"];
    }
  }

  // Per-host settings: check hosts.<name>.X first, fall back to root X.
  // This lets the user set global defaults at root (via CLI) while
  // individual integrations can override per-host without touching root.
  const config: HonchoCLAUDEConfig = {
    apiKey,
    auth: { ...authState, host: hostKey },
    peerName,
    workspace,
    aiPeer,
    baseUrl: hostBlock?.baseUrl ?? raw.baseUrl,
    legacyWorkspace: raw.globalOverride === true && raw.workspace && raw.workspace !== workspace ? raw.workspace : undefined,
  };

  return mergeWithEnvVars(config);
}

/**
 * Load config purely from environment variables.
 * Returns null if HONCHO_API_KEY is not set.
 * HONCHO_WORKSPACE is respected here (no file config to conflict with).
 */
export function loadConfigFromEnv(host?: HonchoHost): HonchoCLAUDEConfig | null {
  const apiKey = process.env.HONCHO_API_KEY;
  if (!apiKey) {
    return null;
  }

  const resolvedHost = host ?? getDetectedHost();
  const peerName = process.env.HONCHO_PEER_NAME || process.env.USER || process.env.USERNAME || "user";
  const workspace = process.env.HONCHO_WORKSPACE || DEFAULT_WORKSPACE[resolvedHost];
  const hostPeerEnv = resolvedHost === "cursor"
    ? process.env.HONCHO_CURSOR_PEER
    : process.env.HONCHO_CLAUDE_PEER;
  const aiPeer = process.env.HONCHO_AI_PEER || hostPeerEnv || DEFAULT_AI_PEER[resolvedHost];

  const config: HonchoCLAUDEConfig = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
  };

  if (process.env.HONCHO_ENDPOINT?.startsWith("http")) config.baseUrl = process.env.HONCHO_ENDPOINT;

  return config;
}

/**
 * Merge file-based config with environment variable overrides.
 * Only merges global (non-host-specific) env vars. workspace and aiPeer
 * are host-specific fields already resolved by resolveConfig() from the
 * hosts block -- generic env vars like HONCHO_WORKSPACE must not override
 * them here, otherwise a value set for one host clobbers the other.
 * (HONCHO_WORKSPACE IS respected in loadConfigFromEnv when no file exists.)
 */
function mergeWithEnvVars(config: HonchoCLAUDEConfig): HonchoCLAUDEConfig {
  if (process.env.HONCHO_API_KEY) {
    config.apiKey = process.env.HONCHO_API_KEY;
  }
  if (process.env.HONCHO_PEER_NAME) {
    config.peerName = process.env.HONCHO_PEER_NAME;
  }
  return config;
}

// OAuth grants rotate on every refresh, possibly in another process since this
// writer read the file. Take them from disk at write time so a settings save
// never puts back a superseded refresh token.
function carryOAuthFromDisk(data: Record<string, any>): void {
  let disk: Record<string, any>;
  try {
    disk = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return;
  }
  if (disk.oauth) data.oauth = disk.oauth;
  for (const [name, block] of Object.entries<any>(disk.hosts ?? {})) {
    if (!block?.oauth) continue;
    data.hosts ??= {};
    data.hosts[name] = { ...(data.hosts[name] ?? {}), oauth: block.oauth };
  }
}

// config.json can hold an API key, so it is kept owner-only. Written to a temp
// file and renamed so a concurrent reader never sees a half-written file.
function writeConfigFile(data: Record<string, any>): void {
  carryOAuthFromDisk(data);
  const tmp = `${CONFIG_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, CONFIG_FILE);
}

/**
 * Write-back: read-merge-write to avoid clobbering other hosts' config.
 * This integration writes only hosts.<this-host>, never root keys.
 */
export function saveConfig(config: HonchoCLAUDEConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Re-read from disk to avoid clobbering other tools' changes
  let existing: HonchoFileConfig = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      existing = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    } catch {
      // Start fresh if corrupt
    }
  }

  // Everything else goes in the host block.
  // Keep workspace/aiPeer host-local, but avoid materializing root defaults
  // into new host overrides. This preserves root fallback behavior.
  const host = getDetectedHost();
  if (!existing.hosts) existing.hosts = {};
  const existingHost: HostConfig = existing.hosts[host] ?? {};

  const hostEntry: HostConfig = {};

  const setHostIfExplicit = <K extends keyof HostConfig>(
    key: K,
    value: HostConfig[K],
    rootValue: unknown
  ) => {
    if (value === undefined) return;
    const hasHostOverride = Object.prototype.hasOwnProperty.call(existingHost, key);
    if (hasHostOverride || !deepEqual(value, rootValue)) {
      hostEntry[key] = value;
    }
  };

  // Only persist workspace/aiPeer to host block if the block already had them
  // or if they differ from the default for this host.  This prevents root
  // fallback values from being materialized into host overrides.
  setHostIfExplicit("workspace", config.workspace, existing.workspace ?? DEFAULT_WORKSPACE[host]);
  setHostIfExplicit("aiPeer", config.aiPeer, existing.aiPeer ?? DEFAULT_AI_PEER[host]);

  // peerName lives in the host block; an env-only HONCHO_PEER_NAME is not persisted.
  setHostIfExplicit("peerName", process.env.HONCHO_PEER_NAME ? existingHost.peerName : config.peerName, undefined);
  setHostIfExplicit("baseUrl", config.baseUrl, existing.baseUrl);

  // config.apiKey is the resolved credential (maybe an OAuth token or the env
  // var), so never write it here; keep the key saveHostApiKey() stored.
  if (existingHost.apiKey !== undefined) {
    hostEntry.apiKey = existingHost.apiKey;
  }
  if (existingHost.oauth !== undefined) {
    hostEntry.oauth = existingHost.oauth;
  }

  existing.hosts[host] = hostEntry;

  writeConfigFile(existing);
}

/** Set or clear this host's API key (setup pane). */
export function saveHostApiKey(key: string | undefined): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  let existing: HonchoFileConfig = {};
  try { existing = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")); } catch {}
  const host = getDetectedHost();
  existing.hosts ??= {};
  const block = { ...(existing.hosts[host] ?? {}) };
  if (key) block.apiKey = key; else delete block.apiKey;
  existing.hosts[host] = block;
  writeConfigFile(existing);
}

export function getClaudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function getClaudeSettingsDir(): string {
  return join(homedir(), ".claude");
}

/** Honcho session for a Claude Code chat: the Claude Code session id itself.
 *  Hooks pass hookInput.session_id; the MCP server and skills read
 *  CLAUDE_CODE_SESSION_ID, which Claude Code sets for its child processes. */
export function getSessionName(sessionId?: string): string | null {
  const id = sessionId || process.env.CLAUDE_CODE_SESSION_ID;
  return id ? sanitizeForSessionName(id) : null;
}

/**
 * Get all known host keys from the config file's hosts block.
 */
export function getKnownHosts(): string[] {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(cfgPath, "utf-8"));
    return raw.hosts ? Object.keys(raw.hosts) : [];
  } catch {
    return [];
  }
}

/** Simple token estimation (chars / 4) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const estimatedChars = maxTokens * 4;
  if (text.length <= estimatedChars) {
    return text;
  }
  return text.slice(0, estimatedChars - 3) + "...";
}

export interface HonchoClientOptions {
  apiKey: string;
  baseURL: string;
  workspaceId: string;
  timeout?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

/** Get the base URL for Honcho API: baseUrl, else Honcho cloud. */
export function getHonchoBaseUrlFor(baseUrl?: string): string {
  if (!baseUrl) return HONCHO_CLOUD_URL;
  return baseUrl.endsWith("/v3") ? baseUrl : `${baseUrl}/v3`;
}

/** API origin (no /v3), the form harness-plugin-core compares against Honcho cloud. */
function honchoOrigin(baseUrl?: string): string {
  return getHonchoBaseUrlFor(baseUrl).replace(/\/v3$/, "");
}

/** The API origin this plugin targets, even when no credential is configured yet. */
export function getConfiguredOrigin(host: HonchoHost = getDetectedHost()): string {
  const env = process.env.HONCHO_ENDPOINT;
  if (env?.startsWith("http")) return honchoOrigin(env);
  let raw: HonchoFileConfig = {};
  try {
    raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {}
  return honchoOrigin(raw.hosts?.[host]?.baseUrl ?? raw.baseUrl);
}

/**
 * Refresh an OAuth access token that is near expiry and put the result in
 * config.apiKey. A no-op for API keys. Every refresh supersedes the previous
 * access token, so long-lived callers run this before each batch of requests
 * instead of holding on to a token.
 */
export async function refreshCredential(config: HonchoCLAUDEConfig): Promise<void> {
  const host = config.auth?.host ?? getDetectedHost();
  const cred = await ensureFreshCredential({
    path: CONFIG_FILE,
    host,
    baseUrl: honchoOrigin(config.baseUrl),
    env: process.env,
  });
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

/** One-line notice for configs that still rely on the removed `globalOverride`. */
export function getGlobalOverrideNotice(config: HonchoCLAUDEConfig): string | undefined {
  if (!config.legacyWorkspace) return undefined;
  return `[honcho] globalOverride is no longer supported, so this chat uses workspace "${config.workspace}", not "${config.legacyWorkspace}". Run \`honcho doctor\` with the Honcho CLI to fix it, or ask Claude to set your Honcho workspace to "${config.legacyWorkspace}".`;
}

/** Get the base URL for a resolved runtime config. */
export function getHonchoBaseUrl(config: HonchoCLAUDEConfig): string {
  return getHonchoBaseUrlFor(config.baseUrl);
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

/** Whether the config targets the hosted production API. */
export function isProductionEndpoint(config: HonchoCLAUDEConfig): boolean {
  return getHonchoBaseUrl(config) === HONCHO_CLOUD_URL;
}

export function getEndpointInfo(config: HonchoCLAUDEConfig): { type: string; url: string } {
  if (config.baseUrl) return { type: "custom", url: config.baseUrl };
  return { type: "production", url: HONCHO_CLOUD_URL };
}

