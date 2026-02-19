import { homedir } from "os";
import { join, basename } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

function sanitizeForSessionName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

export interface MessageUploadConfig {
  maxUserTokens?: number;
  maxAssistantTokens?: number;
  summarizeAssistant?: boolean;
}

export interface ContextRefreshConfig {
  messageThreshold?: number;
  ttlSeconds?: number;
  skipDialectic?: boolean;
}

export interface LocalContextConfig {
  maxEntries?: number;
}

export type HonchoEnvironment = "production" | "local";

export interface HonchoEndpointConfig {
  environment?: HonchoEnvironment;
  baseUrl?: string;
}

const HONCHO_BASE_URLS = {
  production: "https://api.honcho.dev/v3",
  local: "http://localhost:8000/v3",
} as const;

// ============================================
// Host Detection
// ============================================

export type HonchoHost = "cursor" | "claude-code";

export interface HostConfig {
  workspace?: string;
  aiPeer?: string;
}

let _detectedHost: HonchoHost | null = null;

export function setDetectedHost(host: HonchoHost): void {
  _detectedHost = host;
}

export function getDetectedHost(): HonchoHost {
  return _detectedHost ?? "claude-code";
}

export function detectHost(stdinInput?: Record<string, unknown>): HonchoHost {
  if (stdinInput?.cursor_version) return "cursor";
  return "claude-code";
}

const DEFAULT_WORKSPACE: Record<HonchoHost, string> = {
  "cursor": "cursor",
  "claude-code": "claude_code",
};

// Stdin cache: entry points read stdin once, handlers consume from cache
let _stdinText: string | null = null;

export function cacheStdin(text: string): void {
  _stdinText = text;
}

export function getCachedStdin(): string | null {
  return _stdinText;
}

// ============================================
// Config Types
// ============================================

/** Raw shape of ~/.honcho/config.json on disk */
interface HonchoFileConfig {
  apiKey?: string;
  peerName?: string;
  workspace?: string;
  sessions?: Record<string, string>;
  saveMessages?: boolean;
  messageUpload?: MessageUploadConfig;
  contextRefresh?: ContextRefreshConfig;
  endpoint?: HonchoEndpointConfig;
  localContext?: LocalContextConfig;
  enabled?: boolean;
  logging?: boolean;
  hosts?: Record<string, HostConfig>;
  // Legacy flat fields (read-only fallbacks)
  cursorPeer?: string;
  claudePeer?: string;
}

/** Resolved runtime config consumed by all other code */
export interface HonchoCLAUDEConfig {
  peerName: string;
  apiKey: string;
  workspace: string;
  aiPeer: string;
  sessions?: Record<string, string>;
  saveMessages?: boolean;
  messageUpload?: MessageUploadConfig;
  contextRefresh?: ContextRefreshConfig;
  endpoint?: HonchoEndpointConfig;
  localContext?: LocalContextConfig;
  enabled?: boolean;
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
  if (hostBlock) {
    workspace = hostBlock.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = hostBlock.aiPeer ?? host;
  } else {
    // Legacy fallback
    workspace = raw.workspace ?? DEFAULT_WORKSPACE[host];
    if (host === "cursor") {
      aiPeer = raw.cursorPeer ?? "cursor";
    } else {
      aiPeer = raw.claudePeer ?? "clawd";
    }
  }

  const config: HonchoCLAUDEConfig = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
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

export function loadConfigFromEnv(host?: HonchoHost): HonchoCLAUDEConfig | null {
  const apiKey = process.env.HONCHO_API_KEY;
  if (!apiKey) {
    return null;
  }

  const resolvedHost = host ?? getDetectedHost();
  const peerName = process.env.HONCHO_PEER_NAME || process.env.USER || "user";
  const workspace = process.env.HONCHO_WORKSPACE || DEFAULT_WORKSPACE[resolvedHost];
  const aiPeer = process.env.HONCHO_AI_PEER || process.env.HONCHO_CLAUDE_PEER || process.env.HONCHO_CURSOR_PEER || resolvedHost;
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

function mergeWithEnvVars(config: HonchoCLAUDEConfig): HonchoCLAUDEConfig {
  if (process.env.HONCHO_API_KEY) {
    config.apiKey = process.env.HONCHO_API_KEY;
  }
  if (process.env.HONCHO_WORKSPACE) {
    config.workspace = process.env.HONCHO_WORKSPACE;
  }
  if (process.env.HONCHO_PEER_NAME) {
    config.peerName = process.env.HONCHO_PEER_NAME;
  }
  if (process.env.HONCHO_AI_PEER) {
    config.aiPeer = process.env.HONCHO_AI_PEER;
  }
  if (process.env.HONCHO_ENABLED === "false") {
    config.enabled = false;
  }
  if (process.env.HONCHO_LOGGING === "false") {
    config.logging = false;
  }
  return config;
}

/** Read-merge-write: reads existing file, merges in changes, writes back.
 *  This prevents one surface from clobbering fields owned by the other. */
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
  };

  // Clean up legacy flat fields if hosts block exists
  delete existing.workspace;
  delete existing.cursorPeer;
  delete existing.claudePeer;

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

export function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  const config = loadConfig();
  const peerPart = config?.peerName ? sanitizeForSessionName(config.peerName) : "user";
  const repoPart = sanitizeForSessionName(basename(cwd));
  return `${peerPart}-${repoPart}`;
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
