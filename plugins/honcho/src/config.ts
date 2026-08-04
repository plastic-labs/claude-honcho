import { homedir } from "os";
import { join, basename, dirname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
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

// ============================================
// Composable injection (DEV-2088 + DEV-2024)
// ============================================

/**
 * Components the SessionStart hook may emit once per session. The tuple is the
 * single source of truth: the union type derives from it, and set_config
 * validation builds its allow-set and error text from the same array — so
 * adding a component is a one-line edit with no drift between layers.
 * - "directives": static memory-usage guidance (treat injected memory as
 *   background, use chat/search, save insights) — formerly a manual "paste
 *   this into your CLAUDE.md" README step; now shipped every session instead.
 * - "summary": the SDK `session.summaries().long` narrative.
 * - "peerCard" / "peerRepresentation": the two fields of a single context() call,
 *   each injected at full length (no per-field caps — inclusion is the only lever).
 * - "briefing": a static nudge to call the `get_briefing` MCP tool instead of
 *   injecting summary/peerCard inline — the tool call renders as an expandable
 *   row in the UI, making the briefing user-visible. Use in place of
 *   "summary"/"peerCard", not alongside them (the content would land twice).
 */
export const SESSION_START_COMPONENTS = ["directives", "summary", "peerCard", "peerRepresentation", "briefing"] as const;
export type SessionStartComponent = (typeof SESSION_START_COMPONENTS)[number];

/**
 * Components the UserPromptSubmit hook may emit per non-trivial prompt.
 * - "userContext": a fresh, prompt-scoped peer.context() blob for the user
 *   peer, whose semantic retrieval is shaped by the searchTopK/
 *   searchMaxDistance/maxConclusions knobs below.
 * - "assistantContext": the same peer.context() fetch, but for the AI peer —
 *   what Honcho has derived about the assistant itself.
 * - "sessionContext": recent raw messages from the currently mapped Honcho
 *   session via session.context() (summary off, no search), which can span
 *   other Claude instances sharing the session name.
 * - "dialectic": a reasoned peer.chat() answer over the representation, seeded
 *   from `dialecticTemplate` (the prompt substituted into %{user_query}) at the
 *   `dialecticReasoning` tier. Off by default — chat() is far slower than
 *   context() (~12s at medium), so it runs on its own budget, not the 4s
 *   context race, and stays under the 30s UserPromptSubmit harness ceiling.
 *
 * A "search" component (filtered semantic search over inductive conclusions)
 * was scoped out: `level` is not filterable through the API, so it needs a
 * honcho-backend + SDK change before it can ship. See the plan.
 */
export const PER_TURN_COMPONENTS = ["userContext", "assistantContext", "sessionContext", "dialectic"] as const;
export type PerTurnComponent = (typeof PER_TURN_COMPONENTS)[number];

/** Pre-split configs stored `"context"` for what is now "userContext". */
export function normalizePerTurn(components: string[]): PerTurnComponent[] {
  return components.map((c) => (c === "context" ? "userContext" : c)) as PerTurnComponent[];
}

/**
 * The `injection` config block: turns the two hardcoded injection surfaces
 * into a composable, config-driven menu. Each surface selects zero or more
 * components; the retrieval knobs shape whatever those components emit.
 */
export interface InjectionConfig {
  /** Components emitted once at session open (default: ["directives", "summary", "peerCard"]). */
  sessionStart?: SessionStartComponent[];
  /** Components emitted per non-trivial prompt (default: ["userContext"]). */
  perTurn?: PerTurnComponent[];
  /** Per-turn components whose full injected payload is printed to the terminal.
   *  Components not listed still inject; they just report a one-line summary
   *  instead of their contents (default: [] — summaries only). */
  showContents?: PerTurnComponent[];
  /** Top-K conclusions pulled by context()'s semantic search (default: 10). */
  searchTopK?: number;
  /** Max conclusions injected per context() call (default: 15). */
  maxConclusions?: number;
  /** Max cosine distance for context()'s semantic search — lower is stricter
   *  (default: 0.6). */
  searchMaxDistance?: number;
  /** What drives the per-turn semantic search: the raw "prompt" (default)
   *  or extracted "topics". */
  searchQuerySource?: "topics" | "prompt";
  /** Token budget for the per-turn "sessionContext" message fetch (default: 1500). */
  sessionContextTokens?: number;
  /** Query template for the per-turn "dialectic" component. The user's prompt
   *  is substituted into every `%{user_query}` (default: surface anything from
   *  the user's history relevant to the prompt). */
  dialecticTemplate?: string;
  /** Reasoning tier for the per-turn "dialectic" chat() call (default: "low").
   *  Kept separate from the top-level `reasoningLevel` so per-turn dialectic can
   *  stay cheap on the hot path without lowering the tier used elsewhere. */
  dialecticReasoning?: ReasoningLevel;
}

/** Resolved injection defaults: memory-usage directives + session summary +
 *  peer card at session start, a fresh user-peer context() per turn. Retrieval knobs
 *  are tuned for a lean per-turn block — topK 10 for recall, a 0.6 cosine
 *  distance, searching on the raw prompt. No component prints its contents. */
export const DEFAULT_INJECTION: Required<InjectionConfig> = {
  sessionStart: ["directives", "summary", "peerCard"],
  perTurn: ["userContext"],
  showContents: [],
  searchTopK: 10,
  maxConclusions: 15,
  searchMaxDistance: 0.6,
  searchQuerySource: "prompt",
  sessionContextTokens: 1500,
  dialecticTemplate:
    "Return a compact, factual list of anything from the user's history — preferences, prior decisions, relevant past work — that would help with the following. Write in the third person as background notes; do not address the user, ask questions, or offer next steps. If nothing relevant exists, say so in one line. Relevant to: %{user_query}",
  dialecticReasoning: "medium",
};

export const REASONING_LEVELS = ["minimal", "low", "medium", "high", "max"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export type SessionStrategy = "per-directory" | "git-branch" | "chat-instance";

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

  /** Per-host overrides for settings that may differ across tools */
  enabled?: boolean;
  logging?: boolean;
  saveMessages?: boolean;
  saveToolUse?: boolean;
  saveGitEvents?: boolean;
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
  sessions?: Record<string, string>;
  saveMessages?: boolean;
  /** Save [Tool] action summaries to Honcho (default: false) */
  saveToolUse?: boolean;
  /** Save [Git External] state-change events to Honcho (default: false) */
  saveGitEvents?: boolean;
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
  /** Map of directory path -> session name overrides */
  sessions?: Record<string, string>;
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
  /** Local claude-context.md settings */
  localContext?: LocalContextConfig;
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

  // Resolution order: env var > host-scoped apiKey > root apiKey.
  const apiKey = process.env.HONCHO_API_KEY || hostBlock?.apiKey || raw.apiKey;
  if (!apiKey) return null;

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
    peerName,
    workspace,
    aiPeer,
    sessionStrategy: hostBlock?.sessionStrategy ?? raw.sessionStrategy,
    sessionPeerPrefix: hostBlock?.sessionPeerPrefix ?? raw.sessionPeerPrefix,
    sessions: raw.sessions,
    saveMessages: hostBlock?.saveMessages ?? raw.saveMessages,
    saveToolUse: hostBlock?.saveToolUse ?? raw.saveToolUse,
    saveGitEvents: hostBlock?.saveGitEvents ?? raw.saveGitEvents,
    reasoningLevel: hostBlock?.reasoningLevel ?? raw.reasoningLevel,
    observationMode: hostBlock?.observationMode ?? raw.observationMode,
    messageUpload: hostBlock?.messageUpload ?? raw.messageUpload,
    contextRefresh: hostBlock?.contextRefresh ?? raw.contextRefresh,
    endpoint: hostBlock?.endpoint ?? raw.endpoint,
    localContext: hostBlock?.localContext ?? raw.localContext,
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
  if (process.env.HONCHO_SAVE_TOOL_USE !== undefined) {
    config.saveToolUse = process.env.HONCHO_SAVE_TOOL_USE === "true";
  }
  if (process.env.HONCHO_SAVE_GIT_EVENTS !== undefined) {
    config.saveGitEvents = process.env.HONCHO_SAVE_GIT_EVENTS === "true";
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
  setHostIfExplicit("injection", config.injection, existing.injection);
  setHostIfExplicit("rememberTool", config.rememberTool, existing.rememberTool);

  // Preserve a host-scoped apiKey already on disk. This integration never writes
  // apiKey (config.apiKey is the *resolved* key — env/root — and must not be
  // materialized here), but must not drop hosts.<host>.apiKey on rewrite.
  if (existingHost.apiKey !== undefined) {
    hostEntry.apiKey = existingHost.apiKey;
  }

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

/** Main repository root for a linked worktree, parsed from dir's `.git`
 *  pointer file. Handles standard (`<repo>/.git/worktrees/<n>`) and bare-hub
 *  (`<hub>.git/worktrees/<n>`) layouts; null for regular repositories and
 *  anything else (submodules, separate-git-dir). */
export function resolveWorktreeMainRoot(dir: string): string | null {
  try {
    const gitPath = join(dir, ".git");
    if (!statSync(gitPath).isFile()) return null;
    const match = readFileSync(gitPath, "utf-8").match(/^gitdir:\s*(.+?)\s*$/m);
    if (!match) return null;
    const gitdir = resolve(dir, match[1]);
    const idx = gitdir.lastIndexOf(`${sep}worktrees${sep}`);
    if (idx === -1) return null;
    const gitContainer = gitdir.slice(0, idx);
    if (basename(gitContainer) === ".git") return dirname(gitContainer);
    if (gitContainer.endsWith(".git")) return gitContainer;
    return null;
  } catch {
    return null;
  }
}

// Bound on the .git lookup walk; cwds nested deeper keep per-directory naming.
const MAX_GIT_WALK_UP = 12;

/** Main repository root when cwd is inside a linked git worktree, else null. */
export function worktreeMainRootFor(cwd: string): string | null {
  try {
    let dir = resolve(cwd);
    for (let i = 0; i < MAX_GIT_WALK_UP; i++) {
      if (existsSync(join(dir, ".git"))) return resolveWorktreeMainRoot(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getSessionForPath(cwd: string, mainRoot?: string | null): string | null {
  const config = loadConfig();
  if (!config?.sessions) return null;
  if (config.sessions[cwd]) return config.sessions[cwd];
  // Worktrees without a mapping of their own share the main repo's session.
  const mr = mainRoot === undefined ? worktreeMainRootFor(cwd) : mainRoot;
  if (mr && config.sessions[mr]) return config.sessions[mr];
  return null;
}

export function deriveSessionName(
  strategy: SessionStrategy,
  cwd: string,
  opts: { peerName?: string; sessionPeerPrefix?: boolean; branch?: string; instanceId?: string } = {}
): string {
  const usePrefix = opts.sessionPeerPrefix !== false; // default true
  const peerPart = opts.peerName ? sanitizeForSessionName(opts.peerName) : "user";
  const repoPart = sanitizeForSessionName(basename(cwd));
  const base = usePrefix ? `${peerPart}-${repoPart}` : repoPart;

  switch (strategy) {
    case "git-branch": {
      if (opts.branch) {
        const branchPart = sanitizeForSessionName(opts.branch);
        return `${base}-${branchPart}`;
      }
      return base;
    }
    case "chat-instance": {
      if (opts.instanceId) {
        return usePrefix ? `${peerPart}-chat-${opts.instanceId}` : `chat-${opts.instanceId}`;
      }
      return base;
    }
    case "per-directory":
    default:
      return base;
  }
}

/** Session name derived from strategy. Manual overrides only apply to per-directory.
 *  @param instanceId - Explicit instance ID for chat-instance strategy. Falls back to
 *                      per-cwd cache, then global cache. Callers should pass hookInput.session_id
 *                      when available to avoid cross-session collision from the global cache.
 */
export function getSessionName(cwd: string, instanceId?: string): string {
  const config = loadConfig();
  const strategy = config?.sessionStrategy ?? "per-directory";
  const mainRoot = worktreeMainRootFor(cwd);

  // Manual overrides only apply to per-directory strategy.
  // For chat-instance and git-branch, the session name is always derived dynamically.
  if (strategy === "per-directory") {
    const configuredSession = getSessionForPath(cwd, mainRoot);
    if (configuredSession) {
      return configuredSession;
    }
  }

  // Resolve live env state, then delegate to the pure deriver.
  let branch: string | undefined;
  if (strategy === "git-branch") {
    branch = captureGitState(cwd)?.branch;
  }
  let resolvedInstanceId: string | undefined;
  if (strategy === "chat-instance") {
    // Prefer explicit instanceId > per-cwd cache > global cache (legacy)
    resolvedInstanceId = instanceId || getInstanceIdForCwd(cwd) || getClaudeInstanceId() || undefined;
  }

  // Worktrees derive from the main repo's path; branch still comes from the
  // worktree's own checkout above.
  return deriveSessionName(strategy, mainRoot ?? cwd, {
    peerName: config?.peerName,
    sessionPeerPrefix: config?.sessionPeerPrefix,
    branch,
    instanceId: resolvedInstanceId,
  });
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
  const resolved = { ...DEFAULT_INJECTION, ...(injection ?? {}) };
  // Guard hand-edited configs: a non-array component list falls back to the default.
  resolved.perTurn = Array.isArray(resolved.perTurn)
    ? normalizePerTurn(resolved.perTurn)
    : DEFAULT_INJECTION.perTurn;
  resolved.showContents = Array.isArray(resolved.showContents)
    ? normalizePerTurn(resolved.showContents)
    : DEFAULT_INJECTION.showContents;
  return resolved;
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
    timeout: 120000,
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
