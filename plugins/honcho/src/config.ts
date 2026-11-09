import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import {
  checkConfig,
  configPath,
  ensureFreshCredential,
  migrateHost,
  pickCredential,
  readConfigFile,
  resolveConfig,
  saveHost,
  telemetryHeaders,
  DEFAULT_BASE_URL,
  type Credential,
} from "@honcho-ai/harness-plugin-core";

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

function resolveHost(host: HonchoHost) {
  return resolveConfig(readConfigFile(), {
    host,
    defaults: { workspace: DEFAULT_WORKSPACE[host], aiPeer: DEFAULT_AI_PEER[host] },
  });
}

/** This host's config, or null when it has no credential. */
export function loadConfig(host: HonchoHost = getDetectedHost()): HonchoCLAUDEConfig | null {
  const cfg = resolveHost(host);
  const cred = pickCredential(readConfigFile(), { host, baseUrl: cfg.baseUrl });
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
 * vars, and defaults, are not written.
 */
export async function saveConfig(config: HonchoCLAUDEConfig): Promise<void> {
  const host = getDetectedHost();
  const env = process.env;
  const patch: Record<string, string | undefined> = {};
  if (!env.HONCHO_PEER_NAME) patch.peerName = config.peerName;
  if (!env.HONCHO_WORKSPACE) patch.workspace = config.workspace === DEFAULT_WORKSPACE[host] ? undefined : config.workspace;
  if (!env.HONCHO_AI_PEER) patch.aiPeer = config.aiPeer === DEFAULT_AI_PEER[host] ? undefined : config.aiPeer;
  if (!env.HONCHO_BASE_URL) patch.baseUrl = config.baseUrl === DEFAULT_BASE_URL ? undefined : config.baseUrl;
  await saveHost(configPath(), host, patch);
}

/** Set or clear this host's API key (setup pane). */
export async function saveHostApiKey(key: string | undefined): Promise<void> {
  await saveHost(configPath(), getDetectedHost(), { apiKey: key });
}

/** The API origin this plugin targets, even when no credential is configured yet. */
export function getConfiguredOrigin(host: HonchoHost = getDetectedHost()): string {
  return resolveHost(host).baseUrl;
}

/** Problems in the config file that affect this host; `honcho doctor` fixes them. */
export function getConfigIssues(host: HonchoHost = getDetectedHost()): string[] {
  return checkConfig(readConfigFile())
    .filter((i) => i.path === "(top level)" || i.path === `hosts.${host}` || (i.path === "hosts" && i.message.includes(host)))
    .map((i) => i.message);
}

/** Keys this plugin wrote to its block in earlier versions and no longer reads. */
const DEAD_HOST_KEYS = [
  "sessionStrategy", "sessionPeerPrefix", "sessions", "injection", "contextRefresh", "messageUpload",
  "reasoningLevel", "statusline", "saveToolUse", "saveGitEvents", "redactPatterns", "rememberTool",
  "observationMode", "saveMessages", "enabled", "logging", "globalOverride", "linkedHosts",
];

/**
 * Move an older config's settings into this host's block (top-level apiKey,
 * peerName, baseUrl; old key names; dead keys). Leaves the top level and other
 * hosts alone. Returns a one-line notice when it changed something.
 */
export async function migrateConfig(host: HonchoHost = getDetectedHost()): Promise<string | undefined> {
  try {
    const changed = await migrateHost(configPath(), host, DEAD_HOST_KEYS);
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
  const host = config.auth?.host ?? getDetectedHost();
  const cred = await ensureFreshCredential({ path: configPath(), host, baseUrl: config.baseUrl, env: process.env });
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

export function getEndpointInfo(config: HonchoCLAUDEConfig): { type: string; url: string } {
  return { type: config.baseUrl === DEFAULT_BASE_URL ? "production" : "custom", url: config.baseUrl };
}
