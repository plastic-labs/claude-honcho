import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Honcho } from "@honcho-ai/sdk";
import { existsSync, readFileSync } from "fs";
import {
  loadConfig,
  saveConfig,
  saveRootField,
  coerceBoolean,
  getHonchoClientOptions,
  getSessionName,
  getConfigPath,
  configExists,
  getDetectedHost,
  getEndpointInfo,
  getKnownHosts,
  setDetectedHost,
  type HonchoCLAUDEConfig,
  type SessionStrategy,
  type ReasoningLevel,
  type HonchoEnvironment,
  type ObservationMode,
  type StatuslineMode,
  type SessionStartComponent,
  type PerTurnComponent,
  SESSION_START_COMPONENTS,
  PER_TURN_COMPONENTS,
  normalizePerTurn,
  REASONING_LEVELS,
  getObservationMode,
  getPluginVersion,
} from "../config.js";
import { honchoSessionUrl } from "../styles.js";
import {
  getLastActiveCwd,
  clearIdCache,
  clearPeerCache,
  clearUserContextOnly,
  clearClaudeContextOnly,
} from "../cache.js";

// ============================================
// Environment variable names that can shadow config fields
// ============================================

const ENV_SHADOW_MAP: Record<string, string> = {
  peerName: "HONCHO_PEER_NAME",
  workspace: "HONCHO_WORKSPACE",
  aiPeer: "HONCHO_AI_PEER",
  enabled: "HONCHO_ENABLED",
  logging: "HONCHO_LOGGING",
  saveMessages: "HONCHO_SAVE_MESSAGES",
  "endpoint.baseUrl": "HONCHO_ENDPOINT",
  "endpoint.environment": "HONCHO_ENDPOINT",
};

// Fields that require confirm=true to change
const DANGEROUS_FIELDS = new Set(["workspace", "endpoint.environment", "endpoint.baseUrl"]);

// Fields that affect session identity/routing — stale sessions risk cross-contamination
const SESSION_AFFECTING_FIELDS = new Set([
  "workspace", "aiPeer", "peerName", "sessionStrategy", "sessionPeerPrefix",
  "endpoint.environment", "endpoint.baseUrl", "globalOverride", "observationMode",
]);

// ============================================
// get_config handler
// ============================================

// ============================================
// Pre-rendered status card (box-drawing)
// ============================================

function renderCard(rows: [string, string][], title: string): string {
  const labelWidth = 12;
  const gap = 3;
  const maxVal = 22;
  const ruleWidth = labelWidth + gap + maxVal + 2;
  const top = `\u250C\u2500 ${title} ${"\u2500".repeat(Math.max(0, ruleWidth - title.length - 4))}`;
  const bot = `\u2514${"\u2500".repeat(ruleWidth)}`;
  const blank = "\u2502";
  const body = rows.map(([label, value]) => {
    const v = value.length > maxVal ? value.slice(0, maxVal - 1) + "\u2026" : value;
    return `\u2502  ${label.padEnd(labelWidth)}${" ".repeat(gap)}${v}`;
  });
  return [top, blank, ...body, blank, bot].join("\n");
}

function handleGetConfig(cwd: string) {
  const cfg = loadConfig();
  const host = getDetectedHost();
  const cfgPath = getConfigPath();
  const cfgExists = configExists();

  // Read raw file to detect hosts block and legacy fields
  let rawFile: Record<string, any> = {};
  if (cfgExists) {
    try { rawFile = JSON.parse(readFileSync(cfgPath, "utf-8")); } catch { /* */ }
  }

  // Resolved config
  const globalOverride = rawFile.globalOverride === true;
  const resolved = cfg ? {
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    workspace: cfg.workspace,
    endpoint: getEndpointInfo(cfg),
    globalOverride,
    sessionStrategy: cfg.sessionStrategy ?? "per-directory",
    sessionPeerPrefix: cfg.sessionPeerPrefix !== false,
    sessions: cfg.sessions ?? {},
    messageUpload: cfg.messageUpload ?? {},
    contextRefresh: cfg.contextRefresh ?? {},
    reasoningLevel: cfg.reasoningLevel ?? "medium",
    observationMode: cfg.observationMode ?? "unified",
    statusline: cfg.statusline ?? "on",
    localContext: cfg.localContext ?? {},
    injection: cfg.injection ?? {},
    rememberTool: cfg.rememberTool === true,
    enabled: cfg.enabled !== false,
    logging: cfg.logging !== false,
    saveMessages: cfg.saveMessages !== false,
  } : null;

  // Current status header values
  const sessionName = cfg ? getSessionName(cwd) : null;
  const endpointInfo = cfg ? getEndpointInfo(cfg) : null;
  const endpointLabel = endpointInfo
    ? endpointInfo.type === "production" ? "platform" : endpointInfo.type
    : null;

  const sessionUrl = cfg && sessionName ? honchoSessionUrl(cfg.workspace, sessionName) : null;

  const current = cfg ? {
    workspace: cfg.workspace,
    session: sessionName,
    sessionUrl,
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    host: `${endpointLabel} (${endpointInfo?.url})`,
  } : null;

  // Host info — include other hosts so the config skill can offer linking
  const allHosts = getKnownHosts();
  const otherHosts: Record<string, { workspace: string }> = {};
  for (const hk of allHosts) {
    if (hk === host) continue;
    const block = rawFile.hosts?.[hk];
    otherHosts[hk] = { workspace: block?.workspace ?? hk };
  }

  const hostInfo = {
    detected: host,
    hasHostsBlock: !!rawFile.hosts,
    otherHosts,
  };

  // Warnings
  const warnings: string[] = [];

  // Host-specific fields (workspace, aiPeer) are NOT overridden by env vars
  // when a hosts block exists. Only warn about env vars that actually apply.
  const hasHostsBlock = !!rawFile.hosts?.[host];
  const hostSpecificFields = new Set(["workspace", "aiPeer"]);

  for (const [field, envVar] of Object.entries(ENV_SHADOW_MAP)) {
    const envVal = process.env[envVar];
    if (!envVal) continue;
    if (hasHostsBlock && hostSpecificFields.has(field)) {
      // Env var is set but hosts block takes precedence — not actually shadowed
      warnings.push(`env var ${envVar}="${envVal}" is set but ignored (hosts block takes precedence). Remove it from your shell config.`);
    } else {
      warnings.push(`${field} is shadowed by env var ${envVar}="${envVal}"`);
    }
  }

  // HONCHO_API_KEY is omitted from ENV_SHADOW_MAP and handled specially: an API
  // key selects the Honcho *environment*, so when the env var overrides the
  // configured key (resolveConfig: env wins, matching standard env>config
  // precedence) every read and write silently routes to a different environment
  // than config.json names. That's far more surprising than a normal override,
  // so surface it whenever the env var is set — loudly on a mismatch.
  const envApiKey = process.env.HONCHO_API_KEY;
  if (envApiKey && rawFile.apiKey) {
    const mask = (k: string) => `${k.slice(0, 10)}…${k.slice(-4)}`;
    if (envApiKey !== rawFile.apiKey) {
      warnings.push(
        `HONCHO_API_KEY env var (${mask(envApiKey)}) overrides config.json apiKey (${mask(rawFile.apiKey)}) and is the key actually in use. ` +
        `An API key selects the Honcho environment, so reads/writes go to the env var's environment, NOT the one config.json names. ` +
        `Unset HONCHO_API_KEY in your shell to use config.json's key.`
      );
    } else {
      warnings.push(`apiKey is also set via HONCHO_API_KEY env var (identical value). The env var takes precedence at runtime.`);
    }
  }

  // Check for legacy fields without hosts block
  if (cfgExists && !rawFile.hosts) {
    warnings.push("Config uses legacy flat fields. Consider running /honcho:config to migrate to hosts block.");
  }

  if (cfgExists && rawFile.hosts && rawFile.workspace && rawFile.globalOverride === undefined) {
    warnings.push("Config has flat 'workspace' alongside hosts block but no 'globalOverride' set. The flat field is unused. Set globalOverride=true to apply it globally, or remove it.");
  }

  // Pre-render the status card
  const strategyLabels: Record<string, string> = {
    "per-directory": "per directory",
    "git-branch": "per git branch",
    "chat-instance": "per chat",
  };
  const hostLabel = endpointInfo
    ? endpointInfo.type === "production"
      ? `platform (app.honcho.dev)`
      : endpointInfo.type === "local"
        ? `local (${endpointInfo.url})`
        : endpointInfo.url
    : "unknown";

  const card = cfg ? renderCard([
    ["workspace", cfg.workspace],

    ["session", sessionName ?? "unknown"],
    ["mapping", strategyLabels[cfg.sessionStrategy ?? "per-directory"] ?? cfg.sessionStrategy ?? "per directory"],
    ["peer", `${cfg.peerName} / ${cfg.aiPeer}`],
    ["host", hostLabel],
    ["messages", cfg.saveMessages !== false ? "saving enabled" : "saving disabled"],
    ["obs mode", cfg.observationMode ?? "unified"],
  ], "current honcho config") : null;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ card, resolved, current, host: hostInfo, warnings, configPath: cfgPath, configExists: cfgExists }, null, 2),
    }],
  };
}

// ============================================
// set_config handler
// ============================================

/**
 * Coerce a set_config `value` into a string array. The `value` field is
 * schema-less, so MCP clients may deliver an array as a real array OR as a
 * JSON-encoded string (e.g. '["summary","peerCard"]'); accept both. Returns
 * null when the value is neither, so the caller can report a shape error.
 */
function coerceStringArray(value: unknown): string[] | null {
  let v = value;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  return Array.isArray(v) ? v.map(String) : null;
}

/**
 * Validate a component-array set_config value against the allowed component
 * names (the SESSION_START_COMPONENTS / PER_TURN_COMPONENTS tuples). Returns the
 * validated array, or an isError tool result describing the shape/enum problem.
 */
function validateComponentArray(
  value: unknown,
  allowed: readonly string[],
  field: string,
): string[] | { content: { type: "text"; text: string }[]; isError: true } {
  const example = JSON.stringify(allowed.slice(0, 2));
  const err = (msg: string) => ({
    content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: msg }, null, 2) }],
    isError: true as const,
  });
  const arr = coerceStringArray(value);
  if (!arr) return err(`${field} must be an array of component names, e.g. ${example}`);
  const bad = arr.filter((v) => !allowed.includes(v));
  if (bad.length) return err(`${field} entries must be one of: ${allowed.join(", ")} (got: ${bad.join(", ")})`);
  return arr;
}

function handleSetConfig(args: Record<string, unknown>) {
  const field = args.field;
  if (typeof field !== "string" || !field) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: "field must be a non-empty string" }, null, 2) }],
      isError: true,
    };
  }
  const value = args.value;
  const confirm = args.confirm === true;

  // Dangerous field gate
  if (DANGEROUS_FIELDS.has(field) && !confirm) {
    const descriptions: Record<string, string> = {
      workspace: "Switches to a different workspace.",
      "endpoint.environment": "Switches the Honcho backend.",
      "endpoint.baseUrl": "Switches the Honcho backend URL.",
    };
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          field,
          requiresConfirm: true,
          description: descriptions[field] ?? "Pass confirm=true to proceed.",
        }, null, 2),
      }],
    };
  }

  const cfg = loadConfig();
  if (!cfg) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: false, error: "No config loaded. Set HONCHO_API_KEY first." }, null, 2),
      }],
      isError: true,
    };
  }

  let previousValue: unknown;
  let cacheInvalidation: { cleared: string[]; reason: string } | null = null;
  const warnings: string[] = [];

  // Check env var shadowing
  const shadowEnv = ENV_SHADOW_MAP[field];
  if (shadowEnv && process.env[shadowEnv]) {
    warnings.push(`${field} is shadowed by env var ${shadowEnv}="${process.env[shadowEnv]}". File will be updated but env var takes precedence at runtime.`);
  }

  // Apply the change
  switch (field) {
    case "peerName":
      previousValue = cfg.peerName;
      cfg.peerName = String(value);
      // peerName is a global field — write to root (user-directed action)
      saveRootField("peerName", cfg.peerName);
      clearPeerCache();
      clearUserContextOnly();
      if (String(value) !== String(previousValue) && Object.keys(cfg.sessions ?? {}).length > 0) {
        warnings.push(`${Object.keys(cfg.sessions ?? {}).length} session override(s) kept under their existing names; only newly created sessions use the new naming. Use sessions.set/sessions.remove to adjust individual mappings.`);
      }
      cacheInvalidation = { cleared: ["peer IDs", "user context"], reason: "Peer name changed" };
      break;

    case "aiPeer":
      previousValue = cfg.aiPeer;
      cfg.aiPeer = String(value);
      clearPeerCache();
      clearClaudeContextOnly();
      cacheInvalidation = { cleared: ["peer IDs", "claude context"], reason: "AI peer changed" };
      break;

    case "workspace":
      previousValue = cfg.workspace;
      cfg.workspace = String(value);
      if (String(value) !== String(previousValue)) {
        clearIdCache();
        clearUserContextOnly();
        clearClaudeContextOnly();
        cacheInvalidation = { cleared: ["all IDs", "all context"], reason: "Workspace changed" };
      }
      break;

    case "endpoint.environment": {
      previousValue = cfg.endpoint?.environment;
      if (!cfg.endpoint) cfg.endpoint = {};
      // Accept "platform" as alias for "production"
      const envVal = String(value) === "platform" ? "production" : String(value);
      cfg.endpoint.environment = envVal as HonchoEnvironment;
      cfg.endpoint.baseUrl = undefined;
      // endpoint is a global field — write to root (user-directed action)
      saveRootField("endpoint", cfg.endpoint);
      clearIdCache();
      clearUserContextOnly();
      clearClaudeContextOnly();
      cacheInvalidation = { cleared: ["all IDs", "all context"], reason: "Endpoint changed" };
      break;
    }

    case "endpoint.baseUrl":
      previousValue = cfg.endpoint?.baseUrl;
      if (!cfg.endpoint) cfg.endpoint = {};
      cfg.endpoint.baseUrl = String(value);
      cfg.endpoint.environment = undefined;
      // endpoint is a global field — write to root (user-directed action)
      saveRootField("endpoint", cfg.endpoint);
      clearIdCache();
      clearUserContextOnly();
      clearClaudeContextOnly();
      cacheInvalidation = { cleared: ["all IDs", "all context"], reason: "Endpoint URL changed" };
      break;

    case "sessionStrategy": {
      const prevStrategy = cfg.sessionStrategy ?? "per-directory";
      previousValue = prevStrategy;
      cfg.sessionStrategy = String(value) as SessionStrategy;
      // Session overrides are kept: they only apply under per-directory (useless for chat-instance, and git-branch needs a different solution)
      if (String(value) !== prevStrategy && String(value) !== "per-directory" && Object.keys(cfg.sessions ?? {}).length > 0) {
        warnings.push(`${Object.keys(cfg.sessions ?? {}).length} session override(s) kept but inactive: overrides only apply under the per-directory strategy.`);
      }
      break;
    }

    case "sessionPeerPrefix": {
      const prevPrefix = cfg.sessionPeerPrefix !== false;
      previousValue = prevPrefix;
      cfg.sessionPeerPrefix = coerceBoolean(value);
      if (cfg.sessionPeerPrefix !== prevPrefix && Object.keys(cfg.sessions ?? {}).length > 0) {
        warnings.push(`${Object.keys(cfg.sessions ?? {}).length} session override(s) kept under their existing names; only newly created sessions use the new naming. Use sessions.set/sessions.remove to adjust individual mappings.`);
      }
      break;
    }

    case "globalOverride":
      previousValue = cfg.globalOverride ?? false;
      cfg.globalOverride = coerceBoolean(value);
      // globalOverride is a root-level flag — write to root (user-directed)
      saveRootField("globalOverride", cfg.globalOverride);
      break;

    case "enabled":
      previousValue = cfg.enabled;
      cfg.enabled = coerceBoolean(value);
      break;

    case "logging":
      previousValue = cfg.logging;
      cfg.logging = coerceBoolean(value);
      break;

    case "saveMessages":
      previousValue = cfg.saveMessages;
      cfg.saveMessages = coerceBoolean(value);
      break;

    case "messageUpload.maxUserTokens":
      previousValue = cfg.messageUpload?.maxUserTokens;
      if (!cfg.messageUpload) cfg.messageUpload = {};
      cfg.messageUpload.maxUserTokens = value === null ? undefined : Number(value);
      break;

    case "messageUpload.maxAssistantTokens":
      previousValue = cfg.messageUpload?.maxAssistantTokens;
      if (!cfg.messageUpload) cfg.messageUpload = {};
      cfg.messageUpload.maxAssistantTokens = value === null ? undefined : Number(value);
      break;

    case "messageUpload.summarizeAssistant":
      previousValue = cfg.messageUpload?.summarizeAssistant;
      if (!cfg.messageUpload) cfg.messageUpload = {};
      cfg.messageUpload.summarizeAssistant = coerceBoolean(value);
      break;

    case "contextRefresh.messageThreshold":
      previousValue = cfg.contextRefresh?.messageThreshold;
      if (!cfg.contextRefresh) cfg.contextRefresh = {};
      cfg.contextRefresh.messageThreshold = Number(value);
      break;

    case "contextRefresh.ttlSeconds":
      previousValue = cfg.contextRefresh?.ttlSeconds;
      if (!cfg.contextRefresh) cfg.contextRefresh = {};
      cfg.contextRefresh.ttlSeconds = Number(value);
      break;

    case "contextRefresh.skipDialectic":
      previousValue = cfg.contextRefresh?.skipDialectic;
      if (!cfg.contextRefresh) cfg.contextRefresh = {};
      cfg.contextRefresh.skipDialectic = coerceBoolean(value);
      break;

    case "reasoningLevel":
      previousValue = cfg.reasoningLevel ?? "medium";
      cfg.reasoningLevel = String(value) as ReasoningLevel;
      break;

    case "observationMode":
      previousValue = cfg.observationMode ?? "unified";
      cfg.observationMode = String(value) as ObservationMode;
      break;

    case "statusline": {
      const mode = String(value).toLowerCase();
      if (mode !== "on" && mode !== "off") {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "statusline must be one of: on, off" }, null, 2) }],
          isError: true,
        };
      }
      previousValue = cfg.statusline ?? "on";
      cfg.statusline = mode as StatuslineMode;
      // statusline is a global field — write to root (user-directed action)
      saveRootField("statusline", cfg.statusline);
      break;
    }

    case "localContext.maxEntries":
      previousValue = cfg.localContext?.maxEntries;
      if (!cfg.localContext) cfg.localContext = {};
      cfg.localContext.maxEntries = Number(value);
      break;

    case "injection.sessionStart": {
      const arr = validateComponentArray(value, SESSION_START_COMPONENTS, field);
      if (!Array.isArray(arr)) return arr;
      previousValue = cfg.injection?.sessionStart;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.sessionStart = arr as SessionStartComponent[];
      break;
    }

    case "injection.perTurn": {
      // Accept the pre-split "context" name and store its replacement.
      const raw = coerceStringArray(value);
      const arr = validateComponentArray(raw ? normalizePerTurn(raw) : value, PER_TURN_COMPONENTS, field);
      if (!Array.isArray(arr)) return arr;
      previousValue = cfg.injection?.perTurn;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.perTurn = arr as PerTurnComponent[];
      break;
    }

    case "injection.showContents": {
      const raw = coerceStringArray(value);
      const arr = validateComponentArray(raw ? normalizePerTurn(raw) : value, PER_TURN_COMPONENTS, field);
      if (!Array.isArray(arr)) return arr;
      previousValue = cfg.injection?.showContents;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.showContents = arr as PerTurnComponent[];
      break;
    }

    case "injection.searchTopK":
      previousValue = cfg.injection?.searchTopK;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.searchTopK = Number(value);
      break;

    case "injection.maxConclusions":
      previousValue = cfg.injection?.maxConclusions;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.maxConclusions = Number(value);
      break;

    case "injection.searchMaxDistance":
      previousValue = cfg.injection?.searchMaxDistance;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.searchMaxDistance = Number(value);
      break;

    case "injection.sessionContextTokens": {
      const tokens = Number(value);
      if (!Number.isFinite(tokens) || tokens <= 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "injection.sessionContextTokens must be a positive number" }, null, 2) }],
          isError: true,
        };
      }
      previousValue = cfg.injection?.sessionContextTokens;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.sessionContextTokens = tokens;
      break;
    }

    case "rememberTool":
      previousValue = cfg.rememberTool;
      cfg.rememberTool = coerceBoolean(value);
      break;

    case "injection.searchQuerySource":
      if (value !== "topics" && value !== "prompt") {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: `injection.searchQuerySource must be "topics" or "prompt"` }, null, 2) }],
          isError: true,
        };
      }
      previousValue = cfg.injection?.searchQuerySource;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.searchQuerySource = value;
      break;

    case "injection.dialecticTemplate":
      previousValue = cfg.injection?.dialecticTemplate;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.dialecticTemplate = String(value);
      break;

    case "injection.dialecticReasoning": {
      const level = String(value);
      if (!REASONING_LEVELS.includes(level as ReasoningLevel)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: `injection.dialecticReasoning must be one of: ${REASONING_LEVELS.join(", ")}` }, null, 2) }],
          isError: true,
        };
      }
      previousValue = cfg.injection?.dialecticReasoning;
      if (!cfg.injection) cfg.injection = {};
      cfg.injection.dialecticReasoning = level as ReasoningLevel;
      break;
    }

    case "sessions.set": {
      const obj = value as Record<string, unknown>;
      const path = obj?.path;
      const sName = obj?.name;
      if (typeof path !== "string" || !path || typeof sName !== "string" || !sName) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "sessions.set requires {path: string, name: string}" }, null, 2) }],
          isError: true,
        };
      }
      if (!cfg.sessions) cfg.sessions = {};
      previousValue = cfg.sessions[path] ?? null;
      cfg.sessions[path] = sName;
      break;
    }

    case "sessions.remove": {
      const obj = value as Record<string, unknown>;
      const rPath = obj?.path;
      if (typeof rPath !== "string" || !rPath) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "sessions.remove requires {path: string}" }, null, 2) }],
          isError: true,
        };
      }
      if (!cfg.sessions) cfg.sessions = {};
      previousValue = cfg.sessions[rPath] ?? null;
      delete cfg.sessions[rPath];
      break;
    }

    default:
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: `Unknown field: ${field}` }, null, 2),
        }],
        isError: true,
      };
  }

  // Persist
  saveConfig(cfg);

  // Return updated resolved config
  const endpointInfo = getEndpointInfo(cfg);
  const resolved = {
    peerName: cfg.peerName,
    aiPeer: cfg.aiPeer,
    workspace: cfg.workspace,
    endpoint: endpointInfo,
    sessionStrategy: cfg.sessionStrategy ?? "per-directory",
    sessionPeerPrefix: cfg.sessionPeerPrefix !== false,
    sessions: cfg.sessions ?? {},
    messageUpload: cfg.messageUpload ?? {},
    contextRefresh: cfg.contextRefresh ?? {},
    reasoningLevel: cfg.reasoningLevel ?? "medium",
    observationMode: cfg.observationMode ?? "unified",
    statusline: cfg.statusline ?? "on",
    localContext: cfg.localContext ?? {},
    injection: cfg.injection ?? {},
    rememberTool: cfg.rememberTool === true,
    enabled: cfg.enabled !== false,
    logging: cfg.logging !== false,
    saveMessages: cfg.saveMessages !== false,
  };

  // Warn about stale sessions when changing fields that affect session routing
  const restartWarning = SESSION_AFFECTING_FIELDS.has(field)
    ? "Close and restart all active Claude Code sessions. Open sessions still use the previous config and will write to the wrong Honcho session."
    : undefined;

  // Include session URL when session-affecting fields change
  const cwd = getLastActiveCwd() || process.cwd();
  const newSessionName = SESSION_AFFECTING_FIELDS.has(field) ? getSessionName(cwd) : undefined;
  const sessionUrl = newSessionName ? honchoSessionUrl(cfg.workspace, newSessionName) : undefined;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        field,
        previousValue,
        newValue: value,
        cacheInvalidation,
        restartWarning,
        sessionUrl,
        warnings: warnings.length ? warnings : undefined,
        resolved,
      }, null, 2),
    }],
  };
}

/** Client-side ceiling for dialectic chat calls. */
const DIALECTIC_TIMEOUT_MS = 120_000;

/** Reasoning tiers the remember tool exposes. `minimal` is too weak to be
 *  worth a fan-out slot; `max` runs ≈80s, unusable when a batch blocks a turn. */
const REMEMBER_REASONING_LEVELS = ["low", "medium", "high"] as const;
/** Hard bound on the fan-out — not a config knob. */
const REMEMBER_MAX_QUERIES = 5;

/** The honcho_remember tool definition. Registered only when the root
 *  `rememberTool` config is on; its description is where the use-often
 *  pressure lives, so the encouragement rides the schema itself. */
const REMEMBER_TOOL = {
  name: "honcho_remember",
  description:
    "Recall what Honcho knows about the user by asking several questions at once. " +
    "Fans out up to 5 parallel dialectic queries and returns a labeled, per-question answer. " +
    "Use this liberally and proactively — before starting a task, whenever the user's " +
    "preferences, past decisions, or history could shape your response, when you're " +
    "about to guess at something they've likely told you before, or when the user asks to " +
    "catch up, resume, or recall what you were working on together ('where are we', " +
    "'what did we just do'). Prefer asking several " +
    "focused questions in one call over one broad question. Pick reasoning_level by need: " +
    "'low' for quick factual lookups, 'medium' for general recall, 'high' for questions " +
    "that need real reasoning over the user's context.",
  inputSchema: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: REMEMBER_MAX_QUERIES,
        description: `1–${REMEMBER_MAX_QUERIES} natural-language questions about the user, dispatched concurrently.`,
      },
      reasoning_level: {
        type: "string",
        enum: [...REMEMBER_REASONING_LEVELS],
        description:
          "Reasoning budget applied to every query in this call. 'low' = quick lookups, " +
          "'medium' = general recall, 'high' = complex reasoning over the user's context.",
      },
    },
    required: ["queries", "reasoning_level"],
  },
};

export async function runMcpServer(): Promise<void> {
  setDetectedHost("claude_code");
  const config = loadConfig();
  if (!config) {
    console.error("[honcho-mcp] Not configured. Run: honcho init");
    process.exit(1);
  }

  const server = new Server(
    {
      name: "honcho",
      version: getPluginVersion(),
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Initialize Honcho client
  const honcho = new Honcho(getHonchoClientOptions(config));

  // Dedicated client for dialectic queries, which run far past the shared
  // 8s timeout (≈80s at max reasoning). No retries: the chat case enforces
  // one DIALECTIC_TIMEOUT_MS deadline across the whole flow.
  const honchoDialectic = new Honcho({
    ...getHonchoClientOptions(config),
    timeout: DIALECTIC_TIMEOUT_MS,
    maxRetries: 0,
  });

  // honcho_remember is opt-in. Resolved once at startup — toggling rememberTool
  // takes effect on next restart, consistent with the plugin's "restart Claude
  // Code after MCP changes" policy.
  const rememberEnabled = config.rememberTool === true;

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        ...(rememberEnabled ? [REMEMBER_TOOL] : []),
        {
          name: "search",
          description: "Search across messages using semantic search. Defaults to the current session; use scope='workspace' to search across all sessions.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
              limit: {
                type: "number",
                description: "Max results (1-50)",
                default: 10,
              },
              scope: {
                type: "string",
                enum: ["session", "workspace"],
                description: "Search scope. 'session' searches only the current directory's session (default). 'workspace' searches across all sessions.",
                default: "session",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "chat",
          description: "Query Honcho's knowledge about the user using dialectic reasoning",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Natural language question about the user",
              },
              reasoning_level: {
                type: "string",
                enum: ["minimal", "low", "medium", "high", "max"],
                description: "Reasoning budget for this query. Use 'low' for simple lookups, 'medium' for general questions, 'high'/'max' for complex reasoning about the user's context. Defaults to config value or 'medium'.",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "create_conclusion",
          description: "Save a key insight or biographical detail about the user to Honcho's memory",
          inputSchema: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "The insight or fact to remember",
              },
            },
            required: ["content"],
          },
        },
        {
          name: "list_conclusions",
          description: "List conclusions Honcho has saved about the user. Use this to review what is remembered before creating duplicates, or to find IDs for deletion.",
          inputSchema: {
            type: "object",
            properties: {
              page: {
                type: "number",
                description: "Page number (1-indexed)",
                default: 1,
              },
              size: {
                type: "number",
                description: "Results per page (max 50)",
                default: 20,
              },
            },
          },
        },
        {
          name: "delete_conclusion",
          description: "Delete a conclusion from Honcho's memory by ID. Use list_conclusions to find the ID first.",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The conclusion ID to delete",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "get_briefing",
          description:
            "Load the session briefing: the stored long summary of this session plus the user's peer card (identity/attribute profile). " +
            "Call this once at the start of a session when the session-start directives ask for it, or any time you need to catch up on where the session left off.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_context",
          description: "Retrieve the full context object (representation + peer card) from Honcho for the current user. Scoped by observation mode.",
          inputSchema: {
            type: "object",
            properties: {
              max_conclusions: {
                type: "number",
                description: "Max conclusions to include (default: 25)",
                default: 25,
              },
            },
          },
        },
        {
          name: "get_representation",
          description: "Retrieve the user's representation string from Honcho. Lighter-weight than get_context.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_config",
          description: "Get the current Honcho plugin configuration, cache state, and diagnostic warnings",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "set_config",
          description: "Update a Honcho plugin configuration field. Dangerous changes (workspace, endpoint) require confirm=true.",
          inputSchema: {
            type: "object",
            properties: {
              field: {
                type: "string",
                description: "Config field to update",
                enum: [
                  "peerName",
                  "aiPeer",
                  "workspace",
                  "globalOverride",
                  "endpoint.environment",
                  "endpoint.baseUrl",
                  "sessionStrategy",
                  "sessionPeerPrefix",
                  "enabled",
                  "logging",
                  "saveMessages",
                  "messageUpload.maxUserTokens",
                  "messageUpload.maxAssistantTokens",
                  "messageUpload.summarizeAssistant",
                  "contextRefresh.messageThreshold",
                  "contextRefresh.ttlSeconds",
                  "contextRefresh.skipDialectic",
                  "reasoningLevel",
                  "observationMode",
                  "localContext.maxEntries",
                  "injection.sessionStart",
                  "injection.perTurn",
                  "injection.showContents",
                  "injection.searchTopK",
                  "injection.maxConclusions",
                  "injection.searchMaxDistance",
                  "injection.searchQuerySource",
                  "injection.sessionContextTokens",
                  "injection.dialecticTemplate",
                  "injection.dialecticReasoning",
                  "rememberTool",
                  "sessions.set",
                  "sessions.remove",
                ],
              },
              value: {
                description: "New value. For sessions.set: {path, name}. For sessions.remove: {path}. For injection.sessionStart / injection.perTurn / injection.showContents: a string array of component names (e.g. [\"summary\",\"peerCard\"]).",
              },
              confirm: {
                type: "boolean",
                description: "Required true for dangerous changes (workspace, endpoint). Without it, returns a warning instead of applying.",
              },
            },
            required: ["field", "value"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const cwd = getLastActiveCwd() || process.cwd();

    // ── Config tools (no Honcho session needed) ──

    if (name === "get_config") {
      return handleGetConfig(cwd);
    }

    if (name === "set_config") {
      return handleSetConfig(args as Record<string, unknown>);
    }

    // ── Peer-only tools (no session needed) ──

    if (name === "list_conclusions" || name === "delete_conclusion") {
      try {
        const observationMode = getObservationMode(config);
        // unified: (observer=user, observed=user); directional: (observer=aiPeer, observed=user)
        const scopePeer = observationMode === "unified"
          ? await honcho.peer(config.peerName)
          : await honcho.peer(config.aiPeer);
        const conclusionScope = scopePeer.conclusionsOf(config.peerName);

        if (name === "list_conclusions") {
          const page = (args?.page as number) ?? 1;
          const size = Math.min((args?.size as number) ?? 20, 100);
          const result = await conclusionScope.list({ page, size });
          const items = result.items.map((c: any) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
          }));
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ items, total: result.total, page: result.page, pages: result.pages }, null, 2),
            }],
          };
        }

        // delete_conclusion
        const id = args?.id as string;
        await conclusionScope.delete(id);
        return {
          content: [{ type: "text", text: `Deleted conclusion ${id}` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }

    // ── Honcho session tools ──

    const sessionName = getSessionName(cwd);

    try {
      const session = await honcho.session(sessionName);
      const observationMode = getObservationMode(config);

      // unified: user observes self — all ops go through userPeer.
      // directional: aiPeer observes user — ops use aiPeer with target.
      const userPeer = await honcho.peer(config.peerName);
      const aiPeer = observationMode === "directional" ? await honcho.peer(config.aiPeer) : null;
      const activePeer = observationMode === "unified" ? userPeer : aiPeer!;
      const chatTarget = observationMode === "unified" ? undefined : config.peerName;
      const contextTarget = observationMode === "unified" ? undefined : config.peerName;

      switch (name) {
        case "search": {
          const query = args?.query as string;
          const limit = (args?.limit as number) ?? 10;
          const scope = (args?.scope as string) ?? "session";

          const messages = scope === "workspace"
            ? await honcho.search(query, { limit })
            : await session.search(query, { limit });

          const results = messages.map((msg: any) => ({
            content: msg.content,
            peerId: msg.peer,
            createdAt: msg.createdAt || msg.created_at,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case "chat": {
          const query = args?.query as string;
          const reasoningLevel = (args?.reasoning_level as string) ?? config.reasoningLevel ?? "medium";

          // Single deadline for the whole flow (peer resolve + chat), so
          // sequential requests can't stack past the harness's 150s budget
          let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
          const deadline = new Promise<never>((_, reject) => {
            deadlineTimer = setTimeout(
              () => reject(new Error(`Dialectic call exceeded ${DIALECTIC_TIMEOUT_MS}ms`)),
              DIALECTIC_TIMEOUT_MS
            );
          });

          const chatFlow = (async () => {
            const dialecticPeer = await honchoDialectic.peer(activePeer.id);
            return dialecticPeer.chat(query, {
              ...(chatTarget ? { target: chatTarget } : {}),
              session,
              reasoningLevel,
            });
          })();

          try {
            const response = await Promise.race([chatFlow, deadline]);
            return {
              content: [
                {
                  type: "text",
                  text: response ?? "No response from Honcho",
                },
              ],
            };
          } finally {
            clearTimeout(deadlineTimer);
            chatFlow.catch(() => {});
          }
        }

        case "honcho_remember": {
          const queries = Array.isArray(args?.queries)
            ? (args.queries as unknown[]).map(String).map((q) => q.trim()).filter(Boolean)
            : [];
          const reasoningLevel = args?.reasoning_level as string;

          if (queries.length === 0) {
            return {
              content: [{ type: "text", text: "honcho_remember requires a non-empty `queries` array." }],
              isError: true,
            };
          }
          if (queries.length > REMEMBER_MAX_QUERIES) {
            return {
              content: [{ type: "text", text: `honcho_remember accepts at most ${REMEMBER_MAX_QUERIES} queries (got ${queries.length}).` }],
              isError: true,
            };
          }
          if (!(REMEMBER_REASONING_LEVELS as readonly string[]).includes(reasoningLevel)) {
            return {
              content: [{ type: "text", text: `reasoning_level must be one of: ${REMEMBER_REASONING_LEVELS.join(", ")}` }],
              isError: true,
            };
          }

          // One dialectic peer, one deadline spanning the whole fan-out — mirrors
          // the `chat` case so a batch can't stack past the harness's turn budget.
          let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
          const deadline = new Promise<never>((_, reject) => {
            deadlineTimer = setTimeout(
              () => reject(new Error(`honcho_remember exceeded ${DIALECTIC_TIMEOUT_MS}ms`)),
              DIALECTIC_TIMEOUT_MS
            );
          });

          const batchStart = Date.now();
          // allSettled: one failed dialectic degrades to a labeled miss rather
          // than sinking the whole batch.
          const fanOut = (async () => {
            const dialecticPeer = await honchoDialectic.peer(activePeer.id);
            return Promise.allSettled(
              queries.map(async (q) => {
                const qStart = Date.now();
                const answer = await dialecticPeer.chat(q, {
                  ...(chatTarget ? { target: chatTarget } : {}),
                  session,
                  reasoningLevel,
                });
                return { answer, ms: Date.now() - qStart };
              })
            );
          })();

          try {
            const settled = await Promise.race([fanOut, deadline]);
            const totalMs = Date.now() - batchStart;
            const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

            const hits = settled.filter(
              (r) => r.status === "fulfilled" && r.value.answer
            ).length;

            const header =
              `recalled ${hits} insight${hits === 1 ? "" : "s"} · ` +
              `${queries.length} dialectic${queries.length === 1 ? "" : "s"} @ ${reasoningLevel} · ${secs(totalMs)}`;

            const blocks = settled.map((r, i) => {
              const label = `q${i + 1} "${queries[i]}"`;
              if (r.status === "rejected") {
                const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
                return `${label} — failed\n→ (error: ${msg})`;
              }
              const { answer, ms } = r.value;
              const body = answer && answer.trim() ? answer.trim() : "(no memory found)";
              return `${label} — ${secs(ms)}\n→ ${body}`;
            });

            return {
              content: [{ type: "text", text: `${header}\n\n${blocks.join("\n\n")}` }],
            };
          } finally {
            clearTimeout(deadlineTimer);
            fanOut.catch(() => {});
          }
        }

        case "create_conclusion": {
          const content = args?.content as string;

          const conclusions = await activePeer.conclusionsOf(config.peerName).create({
            content,
            sessionId: session.id,
          });

          return {
            content: [
              {
                type: "text",
                text: `Saved conclusion: ${conclusions[0]?.content || content}`,
              },
            ],
          };
        }

        case "get_briefing": {
          // Fetches at sessionStart "summary"/"peerCard" components
          const [summariesResult, ctxResult] = await Promise.allSettled([
            session.summaries(),
            activePeer.context({
              ...(contextTarget ? { target: contextTarget } : {}),
              maxConclusions: 25,
              includeMostFrequent: true,
            }),
          ]);

          const summary = summariesResult.status === "fulfilled"
            ? (summariesResult.value as any)?.longSummary?.content?.trim()
            : null;
          const card: string[] = ctxResult.status === "fulfilled"
            ? ((ctxResult.value as any)?.peerCard ?? []).filter((item: string) => item?.trim())
            : [];

          const parts: string[] = [];
          if (summary) parts.push(`## Session summary\n${summary}`);
          if (card.length) parts.push(`## Peer card (${card.length} items)\n${card.map((item) => `- ${item}`).join("\n")}`);
          if (parts.length === 0) parts.push("No briefing available yet — no stored session summary or peer card.");

          return {
            content: [{ type: "text", text: parts.join("\n\n") }],
          };
        }

        case "get_context": {
          const maxConclusions = (args?.max_conclusions as number) ?? 25;

          const ctx = await activePeer.context({
            ...(contextTarget ? { target: contextTarget } : {}),
            maxConclusions,
            includeMostFrequent: true,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(ctx, null, 2) }],
          };
        }

        case "get_representation": {
          const rep = await activePeer.representation(
            contextTarget ? { target: contextTarget } : undefined
          );

          return {
            content: [{ type: "text", text: typeof rep === "string" ? rep : JSON.stringify(rep, null, 2) }],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
