import { homedir } from "os";
import { join, basename, dirname, resolve } from "path";
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

  // Register repo-local config (if the working tree has a .honcho/config.json),
  // mirroring the cwd resolution used by the hook handlers. No-op when absent.
  const wsRoots = input.workspace_roots;
  const cwd = (Array.isArray(wsRoots) && typeof wsRoots[0] === "string" ? wsRoots[0] : undefined)
    ?? (typeof input.cwd === "string" ? input.cwd : undefined)
    ?? process.cwd();
  setLocalConfigContext(cwd);
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
  /** Repo-local only: pin every session in this project tree to one fixed name. */
  sessionName?: string;
  /** Repo-local only: give each nested git repo (submodule) its own session. */
  splitSubmodules?: boolean;
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

  /** How sessions are named: per-directory, git-branch, or chat-instance */
  sessionStrategy?: SessionStrategy;
  /** Prefix session names with peerName (default: true, disable for solo use) */
  sessionPeerPrefix?: boolean;
  /** Repo-local only: pin every session in this project tree to one fixed name. */
  sessionName?: string;
  /** Repo-local only: give each nested git repo (submodule) its own session (inherits workspace). */
  splitSubmodules?: boolean;
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
      return applyLocalConfigOverrides(resolveConfig(raw, resolvedHost), resolvedHost);
    } catch {
      // Fall through to env-only config
    }
  }
  return applyLocalConfigOverrides(loadConfigFromEnv(resolvedHost), resolvedHost);
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

  // Per-host settings: check hosts.<name>.X first, fall back to root X.
  // This lets the user set global defaults at root (via CLI) while
  // individual integrations can override per-host without touching root.
  const config: HonchoCLAUDEConfig = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
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

// ============================================
// Repo-local config overlay (extension)
//
// If a repository contains a `.honcho/config.json`, its fields override the
// global ~/.honcho/config.json for that working tree. This is purely additive:
// when no repo-local config is registered/found, every function below is a
// no-op and global resolution is unchanged.
//
// The repo-local file is treated as READ-ONLY by the plugin — it is never
// written to, and while it is active the plugin does not persist config to the
// global file either (see saveConfig / setSessionForPath). An override can
// therefore never leak into or corrupt the global config. Caches/logs continue
// to live in ~/.honcho and are keyed by cwd, so they do not collide.
// ============================================

const LOCAL_CONFIG_FLAG = Symbol("honchoLocalConfig");

/** cwd-derived path to the active repo-local `.honcho` dir, or null. */
let _localConfigDir: string | null = null;

/**
 * Walk up from `startCwd` to find the nearest repo-local `.honcho/config.json`.
 * Never matches the global `~/.honcho` directory.
 */
export function findLocalConfigDir(startCwd: string): string | null {
  try {
    const home = homedir();
    let dir = resolve(startCwd);
    for (let i = 0; i < 64; i++) {
      // Never treat the global ~/.honcho as a repo-local config.
      if (dir !== home && existsSync(join(dir, ".honcho", "config.json"))) {
        return join(dir, ".honcho");
      }
      const parent = dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
  } catch {
    // ignore — fall back to global config
  }
  return null;
}

/**
 * Walk up from `startCwd` to find the nearest git repository root (a dir with a
 * `.git` file or directory — submodules use a `.git` file), without going above
 * `stopAtDir` (the project root). Returns null if none is found within bounds.
 * Used by `splitSubmodules` to anchor each nested git repo to its own session.
 */
export function findNearestGitRoot(startCwd: string, stopAtDir: string): string | null {
  try {
    const stop = resolve(stopAtDir);
    let dir = resolve(startCwd);
    for (let i = 0; i < 64; i++) {
      if (existsSync(join(dir, ".git"))) return dir; // .git file (submodule) or dir
      if (dir === stop) break;                        // don't search above the project root
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // ignore — fall back to the project root anchor
  }
  return null;
}

/** Register the working directory used to discover a repo-local config. */
export function setLocalConfigContext(cwd: string | null | undefined): void {
  _localConfigDir = cwd ? findLocalConfigDir(cwd) : null;
}

/** Explicitly set (or clear) the active repo-local `.honcho` dir. */
export function setLocalConfigDir(dir: string | null): void {
  _localConfigDir = dir;
}

export function getLocalConfigDir(): string | null {
  return _localConfigDir;
}

export function getLocalConfigPath(): string | null {
  return _localConfigDir ? join(_localConfigDir, "config.json") : null;
}

export function hasLocalConfig(): boolean {
  const p = getLocalConfigPath();
  return !!p && existsSync(p);
}

/** True if a resolved config was produced from a repo-local overlay. */
export function isLocalConfig(config: HonchoCLAUDEConfig | null | undefined): boolean {
  return !!config && (config as any)[LOCAL_CONFIG_FLAG] === true;
}

function markLocalConfig(config: HonchoCLAUDEConfig): HonchoCLAUDEConfig {
  // Non-enumerable so it is never serialized by JSON.stringify (get_config) and
  // never written to disk by saveConfig.
  Object.defineProperty(config, LOCAL_CONFIG_FLAG, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  return config;
}

// Fields a repo-local config may override. apiKey/endpoint are included so a
// repo can point at a different instance, but the common case is `workspace`.
// `sessions` and `globalOverride` are intentionally excluded (global-only).
const LOCAL_OVERRIDABLE_FIELDS = [
  "apiKey", "peerName", "workspace", "aiPeer",
  "sessionStrategy", "sessionPeerPrefix", "sessionName", "splitSubmodules", "saveMessages",
  "reasoningLevel", "observationMode",
  "messageUpload", "contextRefresh", "endpoint", "localContext",
  "enabled", "logging",
] as const;

/** Read a field from the repo-local raw file, host block taking precedence (mirrors resolveConfig). */
function pickLocalField(raw: HonchoFileConfig, host: HonchoHost, key: string): unknown {
  const hostBlock = raw.hosts?.[host]
    ?? raw.hosts?.[host.replace(/_/g, "-")]
    ?? raw.hosts?.[host.replace(/-/g, "_")];
  const fromHost = hostBlock ? (hostBlock as Record<string, unknown>)[key] : undefined;
  return fromHost ?? (raw as Record<string, unknown>)[key];
}

/**
 * Overlay the active repo-local config (if any) on top of the resolved global
 * config. Returns `base` unchanged when there is no repo-local config, so the
 * default (global-only) path is preserved exactly.
 */
function applyLocalConfigOverrides(
  base: HonchoCLAUDEConfig | null,
  host: HonchoHost
): HonchoCLAUDEConfig | null {
  if (!hasLocalConfig()) return base;

  let raw: HonchoFileConfig;
  try {
    raw = JSON.parse(readFileSync(getLocalConfigPath()!, "utf-8")) as HonchoFileConfig;
  } catch {
    return base; // malformed repo-local config — ignore it, keep global behavior
  }

  // Start from the global config when present (so apiKey/endpoint/etc. inherit);
  // otherwise build a standalone config from the local file using the existing
  // resolver (supports a fully self-contained repo-local config).
  const effective: HonchoCLAUDEConfig | null = base
    ? { ...base }
    : resolveConfig(raw, host);
  if (!effective) return base; // no apiKey anywhere → cannot form a config

  for (const key of LOCAL_OVERRIDABLE_FIELDS) {
    const value = pickLocalField(raw, host, key);
    if (value !== undefined) {
      (effective as any)[key] = value;
    }
  }

  return markLocalConfig(effective);
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
  // Never persist a repo-local–overlaid config to the global file: that would
  // leak the per-repo override (workspace, peer, …) into ~/.honcho/config.json.
  // Repo-local config is user-managed by editing the repo's .honcho/config.json.
  if (isLocalConfig(config)) return;

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

  // Repo-local config: anchor session identity to the PROJECT ROOT (the folder
  // that contains .honcho/), not Claude Code's transient working directory.
  // Claude Code reports the cwd it is currently in, which may be a subfolder, so
  // without this a single project would fragment into one session per subfolder.
  // Anchoring keeps the whole project on one session, and bypasses the global
  // per-cwd session map (keyed by absolute paths, possibly stale/unrelated).
  // Granularity stays user-controlled: the nearest ancestor .honcho/ wins, so
  // dropping another .honcho/ in a subtree carves out its own session there.
  const localDir = hasLocalConfig() ? getLocalConfigDir() : null;
  let anchorCwd = cwd;
  if (localDir) {
    const projectRoot = dirname(localDir);
    // splitSubmodules (opt-in): anchor each nested git repo (submodule) to its
    // own session, bounded to within the project root; otherwise the whole tree
    // anchors to the project root. Workspace is unaffected — it's still resolved
    // from the nearest .honcho, so submodules inherit the parent's workspace.
    anchorCwd = config?.splitSubmodules
      ? (findNearestGitRoot(cwd, projectRoot) ?? projectRoot)
      : projectRoot;
  }

  // Manual per-cwd overrides only apply on the default (no repo-local) path.
  // For chat-instance and git-branch, the session name is always derived dynamically.
  if (!localDir && strategy === "per-directory") {
    const configuredSession = getSessionForPath(cwd);
    if (configuredSession) {
      return configuredSession;
    }
  }

  const usePrefix = config?.sessionPeerPrefix !== false; // default true
  const peerPart = config?.peerName ? sanitizeForSessionName(config.peerName) : "user";

  // An explicit `sessionName` in a repo-local config pins the whole project to
  // one fixed session name (peer-prefixed unless disabled), regardless of cwd
  // or strategy.
  if (localDir && config?.sessionName) {
    const pinned = sanitizeForSessionName(config.sessionName);
    return usePrefix ? `${peerPart}-${pinned}` : pinned;
  }

  const repoPart = sanitizeForSessionName(basename(anchorCwd));
  const base = usePrefix ? `${peerPart}-${repoPart}` : repoPart;

  switch (strategy) {
    case "git-branch": {
      const gitState = captureGitState(anchorCwd);
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
  // While a repo-local config is active it is read-only and session names are
  // deterministic, so we skip persistence. This also stops a per-repo override
  // from ever being written into the global config via saveConfig().
  if (hasLocalConfig()) return;
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
