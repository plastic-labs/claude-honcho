import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export interface MessageUploadConfig {
  maxUserTokens?: number; // Truncate user messages to this many tokens (null = no limit)
  maxAssistantTokens?: number; // Truncate assistant messages (null = no limit)
  summarizeAssistant?: boolean; // Summarize assistant messages instead of full text (default: false)
}

export interface ContextRefreshConfig {
  messageThreshold?: number; // Refresh every N messages (default: 50)
  ttlSeconds?: number; // Cache TTL in seconds (default: 300)
  skipDialectic?: boolean; // Skip chat() calls in user-prompt (default: true)
}

export interface LocalContextConfig {
  maxEntries?: number; // Max entries in claude-context.md (default: 50)
}

export type HonchoEnvironment = "production" | "local";

export interface HonchoEndpointConfig {
  environment?: HonchoEnvironment; // "production" (SaaS) or "local" (localhost:8000)
  baseUrl?: string; // Custom URL override (takes precedence over environment)
}

// Default base URLs for the new SDK (v3 API)
const HONCHO_BASE_URLS = {
  production: "https://api.honcho.dev/v3",
  local: "http://localhost:8000/v3",
} as const;

export interface HonchoCLAUDEConfig {
  peerName: string; // The user's peer name
  apiKey: string; // Honcho API key
  workspace: string; // Honcho workspace name
  claudePeer: string; // Claude's peer name (default: "claude")
  sessions?: Record<string, string>; // Map of directory path -> session name
  saveMessages?: boolean; // Save messages to Honcho (default: true)
  messageUpload?: MessageUploadConfig; // Token-based upload limits (default: no limits)
  contextRefresh?: ContextRefreshConfig; // Context retrieval settings
  endpoint?: HonchoEndpointConfig; // SaaS vs local instance config
  localContext?: LocalContextConfig; // Local claude-context.md settings
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

export function loadConfig(): HonchoCLAUDEConfig | null {
  if (!configExists()) {
    return null;
  }
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as HonchoCLAUDEConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: HonchoCLAUDEConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getClaudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function getClaudeSettingsDir(): string {
  return join(homedir(), ".claude");
}

// Session management helpers
export function getSessionForPath(cwd: string): string | null {
  const config = loadConfig();
  if (!config?.sessions) return null;
  return config.sessions[cwd] || null;
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

// Config helpers with defaults
export function getMessageUploadConfig(): MessageUploadConfig {
  const config = loadConfig();
  return {
    maxUserTokens: config?.messageUpload?.maxUserTokens ?? undefined, // No limit by default
    maxAssistantTokens: config?.messageUpload?.maxAssistantTokens ?? undefined, // No limit by default
    summarizeAssistant: config?.messageUpload?.summarizeAssistant ?? false,
  };
}

export function getContextRefreshConfig(): ContextRefreshConfig {
  const config = loadConfig();
  return {
    messageThreshold: config?.contextRefresh?.messageThreshold ?? 30, // Every 30 messages
    ttlSeconds: config?.contextRefresh?.ttlSeconds ?? 300, // 5 minutes
    skipDialectic: config?.contextRefresh?.skipDialectic ?? false, // Dialectic enabled by default
  };
}

export function getLocalContextConfig(): LocalContextConfig {
  const config = loadConfig();
  return {
    maxEntries: config?.localContext?.maxEntries ?? 50, // Default 50 entries
  };
}

// Simple token estimation (chars / 4)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Truncate text to approximate token limit
export function truncateToTokens(text: string, maxTokens: number): string {
  const estimatedChars = maxTokens * 4;
  if (text.length <= estimatedChars) {
    return text;
  }
  return text.slice(0, estimatedChars - 3) + "...";
}

// ============================================
// Honcho Client Options Helper
// ============================================

export interface HonchoClientOptions {
  apiKey: string;
  baseUrl: string;
  workspaceId: string;
}

/**
 * Get the base URL for Honcho API based on config.
 * Priority: baseUrl > environment > "production" (default)
 */
export function getHonchoBaseUrl(config: HonchoCLAUDEConfig): string {
  if (config.endpoint?.baseUrl) {
    // Custom URL takes precedence - ensure it has /v3 suffix
    const url = config.endpoint.baseUrl;
    return url.endsWith("/v3") ? url : `${url}/v3`;
  }
  if (config.endpoint?.environment === "local") {
    return HONCHO_BASE_URLS.local;
  }
  return HONCHO_BASE_URLS.production;
}

/**
 * Get Honcho client options based on config.
 * New SDK requires baseUrl and workspaceId at construction time.
 */
export function getHonchoClientOptions(config: HonchoCLAUDEConfig): HonchoClientOptions {
  return {
    apiKey: config.apiKey,
    baseUrl: getHonchoBaseUrl(config),
    workspaceId: config.workspace,
  };
}

/**
 * Get current endpoint display info
 */
export function getEndpointInfo(config: HonchoCLAUDEConfig): { type: string; url: string } {
  if (config.endpoint?.baseUrl) {
    return { type: "custom", url: config.endpoint.baseUrl };
  }
  if (config.endpoint?.environment === "local") {
    return { type: "local", url: HONCHO_BASE_URLS.local };
  }
  return { type: "production", url: HONCHO_BASE_URLS.production };
}

/**
 * Set endpoint configuration
 */
export function setEndpoint(
  environment?: HonchoEnvironment,
  baseUrl?: string
): void {
  const config = loadConfig();
  if (!config) return;

  config.endpoint = {
    environment,
    baseUrl,
  };
  saveConfig(config);
}
