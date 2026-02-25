import { homedir } from "os";
import { join, basename } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { captureGitState } from "./git.js";
import { getClaudeInstanceId } from "./cache.js";

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

export interface HostConfig {
  /** Honcho workspace name for this host */
  workspace?: string;
  /** AI peer name for this host (e.g. "claude", "cursor") */
  aiPeer?: string;
  /** Other host keys whose workspaces to read context from (writes stay local) */
  linkedHosts?: string[];
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

  const peerName = raw.peerName || process.env.HONCHO_PEER_NAME || process.env.USER || "user";

  // Resolve host-specific fields
  let workspace: string;
  let aiPeer: string;

  const hostBlock = raw.hosts?.[host];

  if (raw.globalOverride === true) {
    // Global override: flat fields apply to ALL hosts
    workspace = raw.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = raw.aiPeer ?? hostBlock?.aiPeer ?? DEFAULT_AI_PEER[host];
  } else if (hostBlock) {
    // Host-specific block takes precedence
    workspace = hostBlock.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = hostBlock.aiPeer ?? DEFAULT_AI_PEER[host];
  } else {
    // Legacy flat-field fallback for configs written before hosts block
    workspace = raw.workspace ?? DEFAULT_WORKSPACE[host];
    if (host === "cursor") {
      aiPeer = raw.cursorPeer ?? DEFAULT_AI_PEER["cursor"];
    } else {
      aiPeer = raw.claudePeer ?? DEFAULT_AI_PEER["claude_code"];
    }
  }

  // Resolve linked hosts
  const linkedHosts = hostBlock?.linkedHosts ?? [];

  const config: HonchoCLAUDEConfig = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
    linkedHosts: linkedHosts.length ? linkedHosts : undefined,
    sessionStrategy: raw.sessionStrategy,
    sessionPeerPrefix: raw.sessionPeerPrefix,
    sessions: raw.sessions,
    saveMessages: raw.saveMessages,
    messageUpload: raw.messageUpload,
    contextRefresh: raw.contextRefresh,
    endpoint: raw.endpoint,
    localContext: raw.localContext,
    enabled: raw.enabled,
    logging: raw.logging,
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
  const peerName = process.env.HONCHO_PEER_NAME || process.env.USER || "user";
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
 * Read-merge-write: reads existing file, merges in changes, writes back.
 * This prevents one host from clobbering fields owned by the other.
 * Host-specific fields (workspace, aiPeer, linkedHosts) live in the
 * hosts block. Legacy flat fields (workspace, cursorPeer, claudePeer)
 * are no longer written — they may still exist in old config files but
 * are only consulted as fallbacks when the hosts block is missing.
 */
export function saveConfig(config: HonchoCLAUDEConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  let existing: HonchoFileConfig = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      existing = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    } catch {
      // Start fresh if corrupt
    }
  }

  // Merge shared fields
  existing.apiKey = config.apiKey;
  existing.peerName = config.peerName;
  existing.sessionStrategy = config.sessionStrategy;
  existing.sessionPeerPrefix = config.sessionPeerPrefix;
  existing.sessions = config.sessions;
  existing.saveMessages = config.saveMessages;
  existing.messageUpload = config.messageUpload;
  existing.contextRefresh = config.contextRefresh;
  existing.endpoint = config.endpoint;
  existing.localContext = config.localContext;
  existing.enabled = config.enabled;
  existing.logging = config.logging;

  // Write host-specific fields into hosts block
  const host = getDetectedHost();
  if (!existing.hosts) existing.hosts = {};
  existing.hosts[host] = {
    workspace: config.workspace,
    aiPeer: config.aiPeer,
    ...(config.linkedHosts?.length ? { linkedHosts: config.linkedHosts } : {}),
  };

  // Preserve globalOverride if set; never implicitly add it
  // (only written when explicitly set via set_config or setup)

  // Clean legacy flat fields when hosts block exists
  if (existing.hosts && !existing.globalOverride) {
    delete existing.cursorPeer;
    delete existing.claudePeer;
    // Only remove flat workspace if it duplicates a host block value
    // (avoids breaking configs where globalOverride isn't set yet)
    const hostWorkspaces = Object.values(existing.hosts).map((h: any) => h.workspace);
    if (existing.workspace && hostWorkspaces.includes(existing.workspace)) {
      delete existing.workspace;
    }
    delete existing.aiPeer;
  }

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

/** Session name derived from strategy. Manual overrides only apply to per-directory. */
export function getSessionName(cwd: string): string {
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
      const instanceId = getClaudeInstanceId();
      if (instanceId) {
        return `chat-${instanceId}`;
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
 * Get workspace names from linked hosts.
 * Returns the workspace names configured for each linked host key.
 * If a linked host has no workspace set, uses its default.
 */
export function getLinkedWorkspaces(): string[] {
  const config = loadConfig();
  if (!config?.linkedHosts?.length) return [];

  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return [];

  let raw: Record<string, any>;
  try {
    raw = JSON.parse(readFileSync(cfgPath, "utf-8"));
  } catch {
    return [];
  }

  const workspaces: string[] = [];
  for (const hostKey of config.linkedHosts) {
    const block = raw.hosts?.[hostKey];
    // Use that host's configured workspace, or fall back to host key as workspace name
    const ws = block?.workspace ?? hostKey;
    // Don't include our own workspace
    if (ws !== config.workspace) {
      workspaces.push(ws);
    }
  }
  return workspaces;
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
  baseUrl: string;
  workspaceId: string;
}

/** Get the base URL for Honcho API. Priority: baseUrl > environment > production */
export function getHonchoBaseUrl(config: HonchoCLAUDEConfig): string {
  if (config.endpoint?.baseUrl) {
    const url = config.endpoint.baseUrl;
    return url.endsWith("/v3") ? url : `${url}/v3`;
  }
  if (config.endpoint?.environment === "local") {
    return HONCHO_BASE_URLS.local;
  }
  return HONCHO_BASE_URLS.production;
}

export function getHonchoClientOptions(config: HonchoCLAUDEConfig): HonchoClientOptions {
  return {
    apiKey: config.apiKey,
    baseUrl: getHonchoBaseUrl(config),
    workspaceId: config.workspace,
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

export function setEndpoint(environment?: HonchoEnvironment, baseUrl?: string): void {
  const config = loadConfig();
  if (!config) return;
  config.endpoint = { environment, baseUrl };
  saveConfig(config);
}
