import { homedir } from "os";
import { join, basename } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { captureGitState } from "./git.js";
import { getInstanceIdForCwd, getClaudeInstanceId } from "./cache.js";

function sanitizeForSessionName(s: string): string {
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
  /** Skip dialectic chat() calls in user-prompt hook (default: false) */
  skipDialectic?: boolean;
}

export interface LocalContextConfig {
  /** Max entries in claude-context.md (default: 50) */
  maxEntries?: number;
}

export type ReasoningLevel = "minimal" | "low" | "medium" | "high" | "max";

export type SessionStrategy = "per-directory" | "git-branch" | "chat-instance";

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
  /** Other host keys whose workspaces to read context from (writes stay local) */
  linkedHosts?: string[];
  /** Per-host overrides for settings that may differ across tools */
  enabled?: boolean;
  logging?: boolean;
  saveMessages?: boolean;
  sessionStrategy?: SessionStrategy;
  sessionPeerPrefix?: boolean;
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
  localContext?: LocalContextConfig;
  endpoint?: HonchoEndpointConfig;
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

/**
 * Shared hook entry point initialization.
 * Reads stdin once, caches it, detects host, and exits early for unsupported hosts.
 * Must be called at the top of every hook entry point before the handler.
 */
export async function initHook(): Promise<void> {
  const stdinText = await Bun.stdin.text();
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
  sessions?: Record<string, string>;
  saveMessages?: boolean;
  messageUpload?: MessageUploadConfig;
  contextRefresh?: ContextRefreshConfig;
  endpoint?: HonchoEndpointConfig;
  localContext?: LocalContextConfig;
  enabled?: boolean;
  logging?: boolean;
  sessionStrategy?: SessionStrategy;
  /** Prefix session names with peerName (default: true, disable for solo use) */
  sessionPeerPrefix?: boolean;
  /** Default reasoning level for Honcho dialectic calls (default: "medium") */
  reasoningLevel?: ReasoningLevel;
  /** Observation mode (default: "unified") */
  observationMode?: ObservationMode;
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
  /** Honcho API key */
  apiKey: string;
  /** Honcho workspace name (resolved per-host) */
  workspace: string;
  /** AI peer name (resolved per-host, e.g. "claude" for claude-code) */
  aiPeer: string;
  /** Other host keys whose workspaces to also read context from */
  linkedHosts?: string[];
  /** How sessions are named: per-directory, git-branch, or chat-instance */
  sessionStrategy?: SessionStrategy;
  /** Prefix session names with peerName (default: true, disable for solo use) */
  sessionPeerPrefix?: boolean;
  /** Map of directory path -> session name overrides */
  sessions?: Record<string, string>;
  /** Save messages to Honcho (default: true) */
  saveMessages?: boolean;
  /** Default reasoning level for Honcho dialectic calls (default: "medium") */
  reasoningLevel?: ReasoningLevel;
  /**
   * Observation mode (default: "unified").
   * "unified": all agents write to user's self-observation collection.
   * "directional": this AI keeps its own per-AI view of the user.
   */
  observationMode?: ObservationMode;
  /** Token-based upload limits */
  messageUpload?: MessageUploadConfig;
  /** Context retrieval settings */
  contextRefresh?: ContextRefreshConfig;
  /** SaaS vs local instance config */
  endpoint?: HonchoEndpointConfig;
  /** Local claude-context.md settings */
  localContext?: LocalContextConfig;
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
  const apiKey = process.env.HONCHO_API_KEY || raw.apiKey;
  if (!apiKey) return null;

  const peerName = raw.peerName || process.env.HONCHO_PEER_NAME || process.env.USER || process.env.USERNAME || "user";

  // Resolve host-specific fields
  let workspace: string;
  let aiPeer: string;

  const hostBlock = raw.hosts?.[host]
    ?? raw.hosts?.[host.replace(/_/g, "-")]
    ?? raw.hosts?.[host.replace(/-/g, "_")];

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

  // Resolve linked hosts
  const linkedHosts = hostBlock?.linkedHosts ?? [];

  // Per-host settings: check hosts.<name>.X first, fall back to root X.
  // This lets the user set global defaults at root (via CLI) while
  // individual integrations can override per-host without touching root.
  const config: HonchoCLAUDEConfig = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
    linkedHosts: linkedHosts.length ? linkedHosts : undefined,
    sessionStrategy: hostBlock?.sessionStrategy ?? raw.sessionStrategy,
    sessionPeerPrefix: hostBlock?.sessionPeerPrefix ?? raw.sessionPeerPrefix,
    sessions: raw.sessions,
    saveMessages: hostBlock?.saveMessages ?? raw.saveMessages,
    reasoningLevel: hostBlock?.reasoningLevel ?? raw.reasoningLevel,
    observationMode: hostBlock?.observationMode ?? raw.observationMode,
    messageUpload: hostBlock?.messageUpload ?? raw.messageUpload,
    contextRefresh: hostBlock?.contextRefresh ?? raw.contextRefresh,
    endpoint: hostBlock?.endpoint ?? raw.endpoint,
    localContext: hostBlock?.localContext ?? raw.localContext,
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
  return config;
}

/**
 * Write-back: read-merge-write to avoid clobbering other hosts' config.
 *
 * Convention:
 *   - Root-level keys (apiKey, peerName, enabled, etc.) are owned by
 *     the user or the honcho CLI.  This integration NEVER writes them.
 *   - hosts.<this-host> is owned by this integration and carries all
 *     per-host settings (workspace, aiPeer, enabled, logging, ...).
 *   - sessions is shared across hosts -- written at root.
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

  // Sessions are shared across hosts -- write at root
  if (config.sessions !== undefined) {
    existing.sessions = config.sessions;
  }

  // Everything else goes in the host block.
  // Keep workspace/aiPeer host-local, but avoid materializing root defaults
  // into new host overrides. This preserves root fallback behavior.
  const host = getDetectedHost();
  if (!existing.hosts) existing.hosts = {};
  const existingHost: HostConfig = existing.hosts[host] ?? {};

  const hostEntry: HostConfig = {};
  if (config.linkedHosts?.length) hostEntry.linkedHosts = config.linkedHosts;

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
  // mergeWithEnvVars() may have set enabled=false or logging=false from
  // HONCHO_ENABLED / HONCHO_LOGGING env vars — those are runtime overrides
  // that should not be materialized to disk.
  const enabledForSave = process.env.HONCHO_ENABLED === "false" && config.enabled === false
    ? existingHost.enabled  // preserve what was on disk
    : config.enabled;
  const loggingForSave = process.env.HONCHO_LOGGING === "false" && config.logging === false
    ? existingHost.logging
    : config.logging;

  setHostIfExplicit("enabled", enabledForSave, existing.enabled);
  setHostIfExplicit("logging", loggingForSave, existing.logging);
  setHostIfExplicit("saveMessages", config.saveMessages, existing.saveMessages);
  setHostIfExplicit("sessionStrategy", config.sessionStrategy, existing.sessionStrategy);
  setHostIfExplicit("sessionPeerPrefix", config.sessionPeerPrefix, existing.sessionPeerPrefix);
  setHostIfExplicit("reasoningLevel", config.reasoningLevel, existing.reasoningLevel);
  setHostIfExplicit("observationMode", config.observationMode, existing.observationMode);
  setHostIfExplicit("messageUpload", config.messageUpload, existing.messageUpload);
  setHostIfExplicit("contextRefresh", config.contextRefresh, existing.contextRefresh);
  setHostIfExplicit("localContext", config.localContext, existing.localContext);
  setHostIfExplicit("endpoint", config.endpoint, existing.endpoint);

  existing.hosts[host] = hostEntry;

  writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
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
  writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
}

export function getClaudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function getClaudeSettingsDir(): string {
  return join(homedir(), ".claude");
}

export function getSessionForPath(cwd: string): string | null {
  const config = loadConfig();
  if (!config?.sessions) return null;
  return config.sessions[cwd] || null;
}

/** Session name derived from strategy. Manual overrides only apply to per-directory.
 *  @param instanceId - Explicit instance ID for chat-instance strategy. Falls back to
 *                      per-cwd cache, then global cache. Callers should pass hookInput.session_id
 *                      when available to avoid cross-session collision from the global cache.
 */
export function getSessionName(cwd: string, instanceId?: string): string {
  const config = loadConfig();
  const strategy = config?.sessionStrategy ?? "per-directory";

  // Manual overrides only apply to per-directory strategy.
  // For chat-instance and git-branch, the session name is always derived dynamically.
  if (strategy === "per-directory") {
    const configuredSession = getSessionForPath(cwd);
    if (configuredSession) {
      return configuredSession;
    }
  }

  const usePrefix = config?.sessionPeerPrefix !== false; // default true
  const peerPart = config?.peerName ? sanitizeForSessionName(config.peerName) : "user";
  const repoPart = sanitizeForSessionName(basename(cwd));
  const base = usePrefix ? `${peerPart}-${repoPart}` : repoPart;

  switch (strategy) {
    case "git-branch": {
      const gitState = captureGitState(cwd);
      if (gitState) {
        const branchPart = sanitizeForSessionName(gitState.branch);
        return `${base}-${branchPart}`;
      }
      return base;
    }
    case "chat-instance": {
      // Prefer explicit instanceId > per-cwd cache > global cache (legacy)
      const resolved = instanceId || getInstanceIdForCwd(cwd) || getClaudeInstanceId();
      if (resolved) {
        return usePrefix ? `${peerPart}-chat-${resolved}` : `chat-${resolved}`;
      }
      return base;
    }
    case "per-directory":
    default:
      return base;
  }
}

export function setSessionForPath(cwd: string, sessionName: string): void {
  const config = loadConfig();
  if (!config) return;
  if (!config.sessions) {
    config.sessions = {};
  }
  config.sessions[cwd] = sessionName;
  saveConfig(config);
}

export function getAllSessions(): Record<string, string> {
  const config = loadConfig();
  return config?.sessions || {};
}

export function removeSessionForPath(cwd: string): void {
  const config = loadConfig();
  if (!config?.sessions) return;
  delete config.sessions[cwd];
  saveConfig(config);
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
    skipDialectic: config?.contextRefresh?.skipDialectic ?? false,
  };
}

export function getLocalContextConfig(): LocalContextConfig {
  const config = loadConfig();
  return {
    maxEntries: config?.localContext?.maxEntries ?? 50,
  };
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
 * Linked host workspace + endpoint resolution from raw config.
 * Endpoint falls back to root endpoint when the host block omits it.
 */
export interface LinkedWorkspaceConfig {
  hostKey: string;
  workspace: string;
  endpoint?: HonchoEndpointConfig;
}

export function getLinkedWorkspaceConfigs(): LinkedWorkspaceConfig[] {
  const config = loadConfig();
  if (!config?.linkedHosts?.length) return [];

  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return [];

  let raw: HonchoFileConfig;
  try {
    raw = JSON.parse(readFileSync(cfgPath, "utf-8")) as HonchoFileConfig;
  } catch {
    return [];
  }

  const linked: LinkedWorkspaceConfig[] = [];
  for (const hostKey of config.linkedHosts) {
    // Normalize: try exact key, then underscore, then dash variants
    const block = raw.hosts?.[hostKey]
      ?? raw.hosts?.[hostKey.replace(/-/g, "_")]
      ?? raw.hosts?.[hostKey.replace(/_/g, "-")];
    // Use that host's configured workspace, or fall back to host key as workspace name
    const ws = block?.workspace ?? hostKey;
    // Don't include our own workspace
    if (ws !== config.workspace) {
      linked.push({
        hostKey,
        workspace: ws,
        endpoint: block?.endpoint ?? raw.endpoint,
      });
    }
  }
  return linked;
}

/**
 * Get workspace names from linked hosts.
 */
export function getLinkedWorkspaces(): string[] {
  return getLinkedWorkspaceConfigs().map((entry) => entry.workspace);
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

/** Get the base URL for a resolved runtime config. */
export function getHonchoBaseUrl(config: HonchoCLAUDEConfig): string {
  return getHonchoBaseUrlForEndpoint(config.endpoint);
}

export function getHonchoClientOptions(config: HonchoCLAUDEConfig): HonchoClientOptions {
  return {
    apiKey: config.apiKey,
    baseURL: getHonchoBaseUrl(config),
    workspaceId: config.workspace,
    timeout: 8000,
    maxRetries: 1,
  };
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
