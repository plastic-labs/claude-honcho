import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { ensureFreshCredential, pickCredential, telemetryHeaders, type Credential, type OAuthTokens } from "@honcho-ai/harness-plugin-core";

export function sanitizeForSessionName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

export interface MessageUploadConfig {
  /** Truncate user messages to this many tokens (undefined = no limit) */
  maxUserTokens?: number;
  /** Truncate assistant messages to this many tokens (undefined = no limit) */
  maxAssistantTokens?: number;
  /** Summarize assistant messages instead of sending full text (default: false) */
  summarizeAssistant?: boolean;
}

export interface ContextRefreshConfig {
  /** Refresh context every N messages (default: 30) */
  messageThreshold?: number;
  /** Cache TTL in seconds (default: 300) */
  ttlSeconds?: number;
}

// ============================================
// Composable injection (DEV-2088 + DEV-2024)
// ============================================

/**
 * Components the SessionStart hook may emit once per session. The tuple is the
 * single source of truth: the union type derives from it, and set_config
 * validation builds its allow-set and error text from the same array — so
 * adding a component is a one-line edit with no drift between layers.
 * - "directives": static memory-usage guidance (treat injected memory as
 *   background, recall with the chat tool) — formerly a manual "paste
 *   this into your CLAUDE.md" README step; now shipped every session instead.
 * - "peerCard": the user's peer card (getCard), injected at full length.
 *
 * Nothing is injected per turn: recall happens when the model calls the
 * `chat` tool.
 */
export const SESSION_START_COMPONENTS = ["directives", "peerCard"] as const;
export type SessionStartComponent = (typeof SESSION_START_COMPONENTS)[number];

/** Removed components: "briefing" carried the peer card, so it maps to
 *  "peerCard"; "summary" and "peerRepresentation" are dropped. */
export function normalizeSessionStart(components: string[]): SessionStartComponent[] {
  const out = components.map((c) => (c === "briefing" ? "peerCard" : c));
  return [...new Set(out)].filter((c): c is SessionStartComponent =>
    (SESSION_START_COMPONENTS as readonly string[]).includes(c));
}

/** The `injection` config block: which components are emitted at session start. */
export interface InjectionConfig {
  /** Components emitted once at session open (default: ["directives", "peerCard"]). */
  sessionStart?: SessionStartComponent[];
}

export const DEFAULT_INJECTION: Required<InjectionConfig> = {
  sessionStart: ["directives", "peerCard"],
};

export const REASONING_LEVELS = ["minimal", "low", "medium", "high", "max"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export type StatuslineMode = "on" | "off";

export type HonchoEnvironment = "production" | "local";

export interface HonchoEndpointConfig {
  /** "production" (SaaS) or "local" (localhost:8000) */
  environment?: HonchoEnvironment;
  /** Custom URL override (takes precedence over environment) */
  baseUrl?: string;
}

const HONCHO_BASE_URLS = {
  production: "https://api.honcho.dev/v3",
  local: "http://localhost:8000/v3",
} as const;

// ============================================
// Host Detection
// ============================================

export type HonchoHost = "cursor" | "claude_code" | "obsidian";

export type ObservationMode = "unified" | "directional";

export interface HostConfig {
  /** Honcho workspace name for this host */
  workspace?: string;
  /** AI peer name for this host (e.g. "claude", "cursor") */
  aiPeer?: string;
  /**
   * Honcho API key scoped to this host. Takes precedence over the root
   * `apiKey` field, but is still overridden by the HONCHO_API_KEY env var.
   * Useful when different hosts (claude_code, cursor, opencode) authenticate
   * against different Honcho orgs or workspaces.
   */
  apiKey?: string;
  /** OAuth grant from this plugin's device sign-in (/honcho:setup). */
  oauth?: OAuthTokens;

  /** Per-host overrides for settings that may differ across tools */
  enabled?: boolean;
  logging?: boolean;
  saveMessages?: boolean;
  saveToolUse?: boolean;
  saveGitEvents?: boolean;
  /** Default reasoning level for Honcho dialectic calls (default: "medium") */
  reasoningLevel?: ReasoningLevel;
  /**
   * Observation mode (default: "unified").
   * "unified": all agents write to user's self-observation collection (observer=user, observed=user).
   * "directional": this AI keeps its own view of the user (observer=aiPeer, observed=user).
   */
  observationMode?: ObservationMode;
  messageUpload?: MessageUploadConfig;
  contextRefresh?: ContextRefreshConfig;
  /** Extra regex patterns redacted from tool summaries (additive to built-in defaults) */
  redactPatterns?: string[];
  endpoint?: HonchoEndpointConfig;
  /** Composable injection config (session-start + per-turn component menus). */
  injection?: InjectionConfig;
  /** Register the on-demand `honcho_remember` MCP tool (default: false). */
  rememberTool?: boolean;
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

// MCP tool arguments may arrive as strings; Boolean("false") is true.
export function coerceBoolean(value: unknown): boolean {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v !== "false" && v !== "0" && v !== "";
  }
  return Boolean(value);
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
  saveMessages?: boolean;
  /** Save [Tool] action summaries to Honcho (default: false) */
  saveToolUse?: boolean;
  /** Save [Git External] state-change events to Honcho (default: false) */
  saveGitEvents?: boolean;
  messageUpload?: MessageUploadConfig;
  contextRefresh?: ContextRefreshConfig;
  endpoint?: HonchoEndpointConfig;
  /** Extra regex patterns redacted from tool summaries (additive to built-in defaults) */
  redactPatterns?: string[];
  enabled?: boolean;
  logging?: boolean;
  /** Default reasoning level for Honcho dialectic calls (default: "medium") */
  reasoningLevel?: ReasoningLevel;
  /** Observation mode (default: "unified") */
  observationMode?: ObservationMode;
  /** Memory statusLine visibility: "on" (default) · "off" */
  statusline?: StatuslineMode;
  /** Composable injection config (session-start + per-turn component menus). */
  injection?: InjectionConfig;
  /** Register the on-demand `honcho_remember` MCP tool (default: false). */
  rememberTool?: boolean;
  hosts?: Record<string, HostConfig>;
  /** When true, flat workspace/aiPeer fields apply to ALL hosts,
   *  ignoring host-specific blocks. When false (default), each host
   *  uses its own block and flat fields are fallbacks only. */
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

  /** Save messages to Honcho (default: true) */
  saveMessages?: boolean;
  /** Save [Tool] action summaries to Honcho (default: false — low signal, redundant with assistant reasoning) */
  saveToolUse?: boolean;
  /** Save [Git External] state-change events to Honcho (default: false — machine plumbing, not user input) */
  saveGitEvents?: boolean;
  /** Default reasoning level for Honcho dialectic calls (default: "medium") */
  reasoningLevel?: ReasoningLevel;
  /**
   * Observation mode (default: "unified").
   * "unified": all agents write to user's self-observation collection.
   * "directional": this AI keeps its own per-AI view of the user.
   */
  observationMode?: ObservationMode;
  /** Memory statusLine visibility: "on" (default) · "off" */
  statusline?: StatuslineMode;
  /** Token-based upload limits */
  messageUpload?: MessageUploadConfig;
  /** Context retrieval settings */
  contextRefresh?: ContextRefreshConfig;
  /** SaaS vs local instance config */
  endpoint?: HonchoEndpointConfig;
  /** Extra regex patterns redacted from tool summaries (additive to built-in defaults) */
  redactPatterns?: string[];
  /** Composable injection config (session-start + per-turn component menus) */
  injection?: InjectionConfig;
  /** Register the on-demand `honcho_remember` MCP tool (default: false).
   *  Not a hook-injection surface — a deliberate, model-invoked recall tool. */
  rememberTool?: boolean;
  /** Temporarily disable plugin (default: true) */
  enabled?: boolean;
  /** Enable file logging to ~/.honcho/ (default: true) */
  logging?: boolean;
  /** When true, flat workspace/aiPeer fields apply to ALL hosts */
  globalOverride?: boolean;
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
    baseUrl: honchoOrigin(hostBlock?.endpoint ?? raw.endpoint),
    env: process.env,
  });
  if (!cred) return null;
  const { token: apiKey, ...authState } = cred;

  const peerName = raw.peerName || process.env.HONCHO_PEER_NAME || process.env.USER || process.env.USERNAME || "user";

  // Resolve host-specific fields
  let workspace: string;
  let aiPeer: string;

  if (raw.globalOverride === true) {
    // Global override: flat fields apply to ALL hosts
    workspace = raw.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = raw.aiPeer ?? hostBlock?.aiPeer ?? DEFAULT_AI_PEER[host];
  } else if (hostBlock) {
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
    saveMessages: hostBlock?.saveMessages ?? raw.saveMessages,
    saveToolUse: hostBlock?.saveToolUse ?? raw.saveToolUse,
    saveGitEvents: hostBlock?.saveGitEvents ?? raw.saveGitEvents,
    reasoningLevel: hostBlock?.reasoningLevel ?? raw.reasoningLevel,
    observationMode: hostBlock?.observationMode ?? raw.observationMode,
    messageUpload: hostBlock?.messageUpload ?? raw.messageUpload,
    contextRefresh: hostBlock?.contextRefresh ?? raw.contextRefresh,
    endpoint: hostBlock?.endpoint ?? raw.endpoint,
    redactPatterns: hostBlock?.redactPatterns ?? raw.redactPatterns,
    injection: hostBlock?.injection ?? raw.injection,
    rememberTool: hostBlock?.rememberTool ?? raw.rememberTool,
    enabled: hostBlock?.enabled ?? raw.enabled,
    logging: hostBlock?.logging ?? raw.logging,
    globalOverride: raw.globalOverride,
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
  const endpoint = process.env.HONCHO_ENDPOINT;

  const config: HonchoCLAUDEConfig = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
    saveMessages: process.env.HONCHO_SAVE_MESSAGES !== "false",
    saveToolUse: process.env.HONCHO_SAVE_TOOL_USE === "true",
    saveGitEvents: process.env.HONCHO_SAVE_GIT_EVENTS === "true",
    enabled: process.env.HONCHO_ENABLED !== "false",
    logging: process.env.HONCHO_LOGGING !== "false",
  };

  if (endpoint) {
    if (endpoint === "local") {
      config.endpoint = { environment: "local" };
    } else if (endpoint.startsWith("http")) {
      config.endpoint = { baseUrl: endpoint };
    }
  }

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
  if (process.env.HONCHO_ENABLED === "false") {
    config.enabled = false;
  }
  if (process.env.HONCHO_LOGGING === "false") {
    config.logging = false;
  }
  if (process.env.HONCHO_SAVE_MESSAGES === "false") {
    config.saveMessages = false;
  }
  if (process.env.HONCHO_SAVE_TOOL_USE !== undefined) {
    config.saveToolUse = process.env.HONCHO_SAVE_TOOL_USE === "true";
  }
  if (process.env.HONCHO_SAVE_GIT_EVENTS !== undefined) {
    config.saveGitEvents = process.env.HONCHO_SAVE_GIT_EVENTS === "true";
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
 *
 * Convention:
 *   - Root-level keys (apiKey, peerName, enabled, etc.) are owned by
 *     the user or the honcho CLI.  This integration NEVER writes them.
 *   - hosts.<this-host> is owned by this integration and carries all
 *     per-host settings (workspace, aiPeer, enabled, logging, ...).
 *
 * resolveConfig() reads host block first, falls back to root, so the
 * user's root-level defaults still apply until overridden per-host.
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

  // Don't persist env-only overrides to the host block.
  // mergeWithEnvVars() may have set enabled, logging or saveMessages to false
  // from HONCHO_ENABLED / HONCHO_LOGGING / HONCHO_SAVE_MESSAGES env vars —
  // those are runtime overrides that should not be materialized to disk.
  const enabledForSave = process.env.HONCHO_ENABLED === "false" && config.enabled === false
    ? existingHost.enabled  // preserve what was on disk
    : config.enabled;
  const loggingForSave = process.env.HONCHO_LOGGING === "false" && config.logging === false
    ? existingHost.logging
    : config.logging;
  const saveMessagesForSave = process.env.HONCHO_SAVE_MESSAGES === "false" && config.saveMessages === false
    ? existingHost.saveMessages
    : config.saveMessages;

  setHostIfExplicit("enabled", enabledForSave, existing.enabled);
  setHostIfExplicit("logging", loggingForSave, existing.logging);
  setHostIfExplicit("saveMessages", saveMessagesForSave, existing.saveMessages);
  setHostIfExplicit("reasoningLevel", config.reasoningLevel, existing.reasoningLevel);
  setHostIfExplicit("observationMode", config.observationMode, existing.observationMode);
  setHostIfExplicit("messageUpload", config.messageUpload, existing.messageUpload);
  setHostIfExplicit("contextRefresh", config.contextRefresh, existing.contextRefresh);
  setHostIfExplicit("redactPatterns", config.redactPatterns, existing.redactPatterns);
  setHostIfExplicit("endpoint", config.endpoint, existing.endpoint);
  setHostIfExplicit("injection", config.injection, existing.injection);
  setHostIfExplicit("rememberTool", config.rememberTool, existing.rememberTool);

  // Preserve a host-scoped apiKey already on disk. This integration never writes
  // apiKey (config.apiKey is the *resolved* key — env/root — and must not be
  // materialized here), but must not drop hosts.<host>.apiKey on rewrite.
  if (existingHost.apiKey !== undefined) {
    hostEntry.apiKey = existingHost.apiKey;
  }
  if (existingHost.oauth !== undefined) {
    hostEntry.oauth = existingHost.oauth;
  }

  existing.hosts[host] = hostEntry;

  writeConfigFile(existing);
}

/**
 * Write a single root-level field to config.json.
 * ONLY for explicit user-directed actions (MCP set_config) on fields
 * that are genuinely global (apiKey, peerName, globalOverride).
 * Hooks and routine operations must NEVER call this.
 */
export function saveRootField(field: string, value: unknown): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  let existing: Record<string, unknown> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      existing = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    } catch {}
  }

  existing[field] = value;
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

export function getMessageUploadConfig(): MessageUploadConfig {
  const config = loadConfig();
  return {
    maxUserTokens: config?.messageUpload?.maxUserTokens ?? undefined,
    maxAssistantTokens: config?.messageUpload?.maxAssistantTokens ?? undefined,
    summarizeAssistant: config?.messageUpload?.summarizeAssistant ?? false,
  };
}

export function getContextRefreshConfig(): ContextRefreshConfig {
  const config = loadConfig();
  return {
    messageThreshold: config?.contextRefresh?.messageThreshold ?? 30,
    ttlSeconds: config?.contextRefresh?.ttlSeconds ?? 300,
  };
}

/**
 * Resolved injection config with every field defaulted. Callers get a fully
 * populated object so they never repeat the fallback literals. Config comes
 * from parsed JSON, so absent keys simply don't appear — the spread over
 * DEFAULT_INJECTION defaults them, while an explicit `[]` is preserved.
 *
 * Pass the already-loaded config (hooks have it in scope) to avoid a second
 * disk read + parse on the per-turn hot path; omit it for a standalone lookup.
 */
export function getInjectionConfig(config?: HonchoCLAUDEConfig | null): Required<InjectionConfig> {
  const injection = (config === undefined ? loadConfig() : config)?.injection;
  const resolved = { ...DEFAULT_INJECTION, ...(injection ?? {}) } as Required<InjectionConfig>;
  // Guard hand-edited configs: a non-array component list falls back to the default.
  resolved.sessionStart = Array.isArray(resolved.sessionStart)
    ? normalizeSessionStart(resolved.sessionStart)
    : DEFAULT_INJECTION.sessionStart;
  return { sessionStart: resolved.sessionStart };
}

export function isLoggingEnabled(): boolean {
  const config = loadConfig();
  return config?.logging !== false;
}

export function isPluginEnabled(): boolean {
  const config = loadConfig();
  return config?.enabled !== false;
}

export function setPluginEnabled(enabled: boolean): void {
  const config = loadConfig();
  if (!config) return;
  config.enabled = enabled;
  saveConfig(config);
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

/** Get the base URL for Honcho API. Priority: baseUrl > environment > production */
export function getHonchoBaseUrlForEndpoint(endpoint?: HonchoEndpointConfig): string {
  if (endpoint?.baseUrl) {
    const url = endpoint.baseUrl;
    return url.endsWith("/v3") ? url : `${url}/v3`;
  }
  if (endpoint?.environment === "local") {
    return HONCHO_BASE_URLS.local;
  }
  return HONCHO_BASE_URLS.production;
}

/** API origin (no /v3), the form harness-plugin-core compares against Honcho cloud. */
function honchoOrigin(endpoint?: HonchoEndpointConfig): string {
  return getHonchoBaseUrlForEndpoint(endpoint).replace(/\/v3$/, "");
}

/** The API origin this plugin targets, even when no credential is configured yet. */
export function getConfiguredOrigin(host: HonchoHost = getDetectedHost()): string {
  const env = process.env.HONCHO_ENDPOINT;
  if (env === "local") return honchoOrigin({ environment: "local" });
  if (env?.startsWith("http")) return honchoOrigin({ baseUrl: env });
  let raw: HonchoFileConfig = {};
  try {
    raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {}
  return honchoOrigin(raw.hosts?.[host]?.endpoint ?? raw.endpoint);
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
    baseUrl: honchoOrigin(config.endpoint),
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
    return "[honcho] Your Honcho sign-in has expired. Run /honcho:setup to sign in again.";
  }
  return undefined;
}

/** Get the base URL for a resolved runtime config. */
export function getHonchoBaseUrl(config: HonchoCLAUDEConfig): string {
  return getHonchoBaseUrlForEndpoint(config.endpoint);
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
  return getHonchoBaseUrl(config) === HONCHO_BASE_URLS.production;
}

export function getEndpointInfo(config: HonchoCLAUDEConfig): { type: string; url: string } {
  if (config.endpoint?.baseUrl) {
    return { type: "custom", url: config.endpoint.baseUrl };
  }
  if (config.endpoint?.environment === "local") {
    return { type: "local", url: HONCHO_BASE_URLS.local };
  }
  return { type: "production", url: HONCHO_BASE_URLS.production };
}

const VALID_ENVIRONMENTS = new Set<HonchoEnvironment>(["production", "local"]);

/** Returns the resolved observation mode, defaulting to "unified". */
export function getObservationMode(config: HonchoCLAUDEConfig): ObservationMode {
  return config.observationMode ?? "unified";
}

export function setEndpoint(environment?: HonchoEnvironment, baseUrl?: string): void {
  const config = loadConfig();
  if (!config) return;
  if (environment && !VALID_ENVIRONMENTS.has(environment)) return;
  config.endpoint = { environment, baseUrl };
  saveConfig(config);
}
