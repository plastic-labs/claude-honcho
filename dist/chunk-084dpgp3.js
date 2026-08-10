import {
  captureGitState,
  getClaudeInstanceId,
  getInstanceIdForCwd
} from "./chunk-gnp95nzg.js";

// src/config.ts
import { homedir } from "os";
import { join, basename, dirname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
function sanitizeForSessionName(s) {
  return s.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}
var SESSION_START_COMPONENTS = ["directives", "summary", "peerCard", "peerRepresentation", "briefing"];
var PER_TURN_COMPONENTS = ["userContext", "assistantContext", "sessionContext", "dialectic"];
function normalizePerTurn(components) {
  return components.map((c) => c === "context" ? "userContext" : c);
}
var DEFAULT_INJECTION = {
  sessionStart: ["directives", "summary", "peerCard"],
  perTurn: ["userContext"],
  showContents: [],
  searchTopK: 10,
  maxConclusions: 15,
  searchMaxDistance: 0.6,
  searchQuerySource: "prompt",
  sessionContextTokens: 1500,
  dialecticTemplate: "Return a compact, factual list of anything from the user's history — preferences, prior decisions, relevant past work — that would help with the following. Write in the third person as background notes; do not address the user, ask questions, or offer next steps. If nothing relevant exists, say so in one line. Relevant to: %{user_query}",
  dialecticReasoning: "medium"
};
var REASONING_LEVELS = ["minimal", "low", "medium", "high", "max"];
var HONCHO_BASE_URLS = {
  production: "https://api.honcho.dev/v3",
  local: "http://localhost:8000/v3"
};
var _detectedHost = null;
function setDetectedHost(host) {
  _detectedHost = host;
}
function getDetectedHost() {
  return _detectedHost ?? "claude_code";
}
function detectHost(stdinInput) {
  const envHost = process.env.HONCHO_HOST;
  if (envHost === "cursor" || envHost === "claude_code" || envHost === "obsidian")
    return envHost;
  if (stdinInput?.cursor_version)
    return "cursor";
  if (process.env.CURSOR_PROJECT_DIR)
    return "cursor";
  return "claude_code";
}
var DEFAULT_WORKSPACE = {
  cursor: "cursor",
  claude_code: "claude_code",
  obsidian: "obsidian"
};
var DEFAULT_AI_PEER = {
  cursor: "cursor",
  claude_code: "claude",
  obsidian: "honcho"
};
function getDefaultWorkspace(host) {
  return DEFAULT_WORKSPACE[host ?? getDetectedHost()];
}
function getDefaultAiPeer(host) {
  return DEFAULT_AI_PEER[host ?? getDetectedHost()];
}
function coerceBoolean(value) {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v !== "false" && v !== "0" && v !== "";
  }
  return Boolean(value);
}
var _stdinText = null;
function cacheStdin(text) {
  _stdinText = text;
}
function getCachedStdin() {
  return _stdinText;
}
async function readStdinText() {
  const chunks = [];
  for await (const chunk of process.stdin)
    chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}
async function initHook() {
  const stdinText = await readStdinText();
  cacheStdin(stdinText);
  let input = {};
  try {
    input = JSON.parse(stdinText || "{}");
  } catch {
    process.exit(0);
  }
  if (input.cursor_version)
    process.exit(0);
  setDetectedHost(detectHost(input));
}
function deepEqual(a, b) {
  if (a === b)
    return true;
  if (a == null || b == null)
    return a === b;
  if (typeof a !== typeof b)
    return false;
  if (typeof a !== "object")
    return false;
  const aObj = a;
  const bObj = b;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) {
    if (!deepEqual(aObj[key], bObj[key]))
      return false;
  }
  return true;
}
var CONFIG_DIR = join(homedir(), ".honcho");
var CONFIG_FILE = join(CONFIG_DIR, "config.json");
function getConfigDir() {
  return CONFIG_DIR;
}
function getConfigPath() {
  return CONFIG_FILE;
}
function configExists() {
  return existsSync(CONFIG_FILE);
}
function getPluginVersion() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const candidates = [
    ...root ? [join(root, ".claude-plugin", "plugin.json")] : [],
    fileURLToPath(new URL("../.claude-plugin/plugin.json", import.meta.url))
  ];
  for (const manifest of candidates) {
    try {
      const version = JSON.parse(readFileSync(manifest, "utf-8")).version;
      if (typeof version === "string" && version)
        return version;
    } catch {}
  }
  return "unknown";
}
function loadConfig(host) {
  const resolvedHost = host ?? getDetectedHost();
  if (configExists()) {
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const raw = JSON.parse(content);
      return resolveConfig(raw, resolvedHost);
    } catch {}
  }
  return loadConfigFromEnv(resolvedHost);
}
function resolveConfig(raw, host) {
  const hostBlock = raw.hosts?.[host] ?? raw.hosts?.[host.replace(/_/g, "-")] ?? raw.hosts?.[host.replace(/-/g, "_")];
  const apiKey = process.env.HONCHO_API_KEY || hostBlock?.apiKey || raw.apiKey;
  if (!apiKey)
    return null;
  const peerName = raw.peerName || process.env.HONCHO_PEER_NAME || process.env.USER || process.env.USERNAME || "user";
  let workspace;
  let aiPeer;
  if (raw.globalOverride === true) {
    workspace = raw.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = raw.aiPeer ?? hostBlock?.aiPeer ?? DEFAULT_AI_PEER[host];
  } else if (hostBlock) {
    workspace = hostBlock.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = hostBlock.aiPeer ?? DEFAULT_AI_PEER[host];
  } else {
    workspace = process.env.HONCHO_WORKSPACE ?? raw.workspace ?? DEFAULT_WORKSPACE[host];
    if (host === "cursor") {
      aiPeer = raw.cursorPeer ?? DEFAULT_AI_PEER["cursor"];
    } else {
      aiPeer = raw.claudePeer ?? DEFAULT_AI_PEER["claude_code"];
    }
  }
  const config = {
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
    globalOverride: raw.globalOverride
  };
  return mergeWithEnvVars(config);
}
function loadConfigFromEnv(host) {
  const apiKey = process.env.HONCHO_API_KEY;
  if (!apiKey) {
    return null;
  }
  const resolvedHost = host ?? getDetectedHost();
  const peerName = process.env.HONCHO_PEER_NAME || process.env.USER || process.env.USERNAME || "user";
  const workspace = process.env.HONCHO_WORKSPACE || DEFAULT_WORKSPACE[resolvedHost];
  const hostPeerEnv = resolvedHost === "cursor" ? process.env.HONCHO_CURSOR_PEER : process.env.HONCHO_CLAUDE_PEER;
  const aiPeer = process.env.HONCHO_AI_PEER || hostPeerEnv || DEFAULT_AI_PEER[resolvedHost];
  const endpoint = process.env.HONCHO_ENDPOINT;
  const config = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
    saveMessages: process.env.HONCHO_SAVE_MESSAGES !== "false",
    saveToolUse: process.env.HONCHO_SAVE_TOOL_USE === "true",
    saveGitEvents: process.env.HONCHO_SAVE_GIT_EVENTS === "true",
    enabled: process.env.HONCHO_ENABLED !== "false",
    logging: process.env.HONCHO_LOGGING !== "false"
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
function mergeWithEnvVars(config) {
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
function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  let existing = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      existing = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    } catch {}
  }
  if (config.sessions !== undefined) {
    existing.sessions = config.sessions;
  }
  const host = getDetectedHost();
  if (!existing.hosts)
    existing.hosts = {};
  const existingHost = existing.hosts[host] ?? {};
  const hostEntry = {};
  const setHostIfExplicit = (key, value, rootValue) => {
    if (value === undefined)
      return;
    const hasHostOverride = Object.prototype.hasOwnProperty.call(existingHost, key);
    if (hasHostOverride || !deepEqual(value, rootValue)) {
      hostEntry[key] = value;
    }
  };
  setHostIfExplicit("workspace", config.workspace, existing.workspace ?? DEFAULT_WORKSPACE[host]);
  setHostIfExplicit("aiPeer", config.aiPeer, existing.aiPeer ?? DEFAULT_AI_PEER[host]);
  const enabledForSave = process.env.HONCHO_ENABLED === "false" && config.enabled === false ? existingHost.enabled : config.enabled;
  const loggingForSave = process.env.HONCHO_LOGGING === "false" && config.logging === false ? existingHost.logging : config.logging;
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
  if (existingHost.apiKey !== undefined) {
    hostEntry.apiKey = existingHost.apiKey;
  }
  existing.hosts[host] = hostEntry;
  writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
}
function saveRootField(field, value) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  let existing = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      existing = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    } catch {}
  }
  existing[field] = value;
  writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
}
function getClaudeSettingsPath() {
  return join(homedir(), ".claude", "settings.json");
}
function getClaudeSettingsDir() {
  return join(homedir(), ".claude");
}
function resolveWorktreeMainRoot(dir) {
  try {
    const gitPath = join(dir, ".git");
    if (!statSync(gitPath).isFile())
      return null;
    const match = readFileSync(gitPath, "utf-8").match(/^gitdir:\s*(.+?)\s*$/m);
    if (!match)
      return null;
    const gitdir = resolve(dir, match[1]);
    const idx = gitdir.lastIndexOf(`${sep}worktrees${sep}`);
    if (idx === -1)
      return null;
    const gitContainer = gitdir.slice(0, idx);
    if (basename(gitContainer) === ".git")
      return dirname(gitContainer);
    if (gitContainer.endsWith(".git"))
      return gitContainer;
    return null;
  } catch {
    return null;
  }
}
var MAX_GIT_WALK_UP = 12;
function worktreeMainRootFor(cwd) {
  try {
    let dir = resolve(cwd);
    for (let i = 0;i < MAX_GIT_WALK_UP; i++) {
      if (existsSync(join(dir, ".git")))
        return resolveWorktreeMainRoot(dir);
      const parent = dirname(dir);
      if (parent === dir)
        break;
      dir = parent;
    }
  } catch {}
  return null;
}
function getSessionForPath(cwd, mainRoot) {
  const config = loadConfig();
  if (!config?.sessions)
    return null;
  if (config.sessions[cwd])
    return config.sessions[cwd];
  const mr = mainRoot === undefined ? worktreeMainRootFor(cwd) : mainRoot;
  if (mr && config.sessions[mr])
    return config.sessions[mr];
  return null;
}
function deriveSessionName(strategy, cwd, opts = {}) {
  const usePrefix = opts.sessionPeerPrefix !== false;
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
function getSessionName(cwd, instanceId) {
  const config = loadConfig();
  const strategy = config?.sessionStrategy ?? "per-directory";
  const mainRoot = worktreeMainRootFor(cwd);
  if (strategy === "per-directory") {
    const configuredSession = getSessionForPath(cwd, mainRoot);
    if (configuredSession) {
      return configuredSession;
    }
  }
  let branch;
  if (strategy === "git-branch") {
    branch = captureGitState(cwd)?.branch;
  }
  let resolvedInstanceId;
  if (strategy === "chat-instance") {
    resolvedInstanceId = instanceId || getInstanceIdForCwd(cwd) || getClaudeInstanceId() || undefined;
  }
  return deriveSessionName(strategy, mainRoot ?? cwd, {
    peerName: config?.peerName,
    sessionPeerPrefix: config?.sessionPeerPrefix,
    branch,
    instanceId: resolvedInstanceId
  });
}
function setSessionForPath(cwd, sessionName) {
  const config = loadConfig();
  if (!config)
    return;
  if (!config.sessions) {
    config.sessions = {};
  }
  config.sessions[cwd] = sessionName;
  saveConfig(config);
}
function getAllSessions() {
  const config = loadConfig();
  return config?.sessions || {};
}
function removeSessionForPath(cwd) {
  const config = loadConfig();
  if (!config?.sessions)
    return;
  delete config.sessions[cwd];
  saveConfig(config);
}
function getMessageUploadConfig() {
  const config = loadConfig();
  return {
    maxUserTokens: config?.messageUpload?.maxUserTokens ?? undefined,
    maxAssistantTokens: config?.messageUpload?.maxAssistantTokens ?? undefined,
    summarizeAssistant: config?.messageUpload?.summarizeAssistant ?? false
  };
}
function getContextRefreshConfig() {
  const config = loadConfig();
  return {
    messageThreshold: config?.contextRefresh?.messageThreshold ?? 30,
    ttlSeconds: config?.contextRefresh?.ttlSeconds ?? 300,
    skipDialectic: config?.contextRefresh?.skipDialectic ?? false
  };
}
function getLocalContextConfig() {
  const config = loadConfig();
  return {
    maxEntries: config?.localContext?.maxEntries ?? 50
  };
}
function getInjectionConfig(config) {
  const injection = (config === undefined ? loadConfig() : config)?.injection;
  const resolved = { ...DEFAULT_INJECTION, ...injection ?? {} };
  resolved.perTurn = Array.isArray(resolved.perTurn) ? normalizePerTurn(resolved.perTurn) : DEFAULT_INJECTION.perTurn;
  resolved.showContents = Array.isArray(resolved.showContents) ? normalizePerTurn(resolved.showContents) : DEFAULT_INJECTION.showContents;
  return resolved;
}
function isLoggingEnabled() {
  const config = loadConfig();
  return config?.logging !== false;
}
function isPluginEnabled() {
  const config = loadConfig();
  return config?.enabled !== false;
}
function setPluginEnabled(enabled) {
  const config = loadConfig();
  if (!config)
    return;
  config.enabled = enabled;
  saveConfig(config);
}
function getKnownHosts() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath))
    return [];
  try {
    const raw = JSON.parse(readFileSync(cfgPath, "utf-8"));
    return raw.hosts ? Object.keys(raw.hosts) : [];
  } catch {
    return [];
  }
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function truncateToTokens(text, maxTokens) {
  const estimatedChars = maxTokens * 4;
  if (text.length <= estimatedChars) {
    return text;
  }
  return text.slice(0, estimatedChars - 3) + "...";
}
function getHonchoBaseUrlForEndpoint(endpoint) {
  if (endpoint?.baseUrl) {
    const url = endpoint.baseUrl;
    return url.endsWith("/v3") ? url : `${url}/v3`;
  }
  if (endpoint?.environment === "local") {
    return HONCHO_BASE_URLS.local;
  }
  return HONCHO_BASE_URLS.production;
}
function getHonchoBaseUrl(config) {
  return getHonchoBaseUrlForEndpoint(config.endpoint);
}
function getHonchoClientOptions(config) {
  return {
    apiKey: config.apiKey,
    baseURL: getHonchoBaseUrl(config),
    workspaceId: config.workspace,
    timeout: 120000,
    maxRetries: 1
  };
}
function getEndpointInfo(config) {
  if (config.endpoint?.baseUrl) {
    return { type: "custom", url: config.endpoint.baseUrl };
  }
  if (config.endpoint?.environment === "local") {
    return { type: "local", url: HONCHO_BASE_URLS.local };
  }
  return { type: "production", url: HONCHO_BASE_URLS.production };
}
var VALID_ENVIRONMENTS = new Set(["production", "local"]);
function getObservationMode(config) {
  return config.observationMode ?? "unified";
}
function setEndpoint(environment, baseUrl) {
  const config = loadConfig();
  if (!config)
    return;
  if (environment && !VALID_ENVIRONMENTS.has(environment))
    return;
  config.endpoint = { environment, baseUrl };
  saveConfig(config);
}

export { SESSION_START_COMPONENTS, PER_TURN_COMPONENTS, normalizePerTurn, DEFAULT_INJECTION, REASONING_LEVELS, setDetectedHost, getDetectedHost, detectHost, getDefaultWorkspace, getDefaultAiPeer, coerceBoolean, cacheStdin, getCachedStdin, readStdinText, initHook, getConfigDir, getConfigPath, configExists, getPluginVersion, loadConfig, loadConfigFromEnv, saveConfig, saveRootField, getClaudeSettingsPath, getClaudeSettingsDir, resolveWorktreeMainRoot, worktreeMainRootFor, getSessionForPath, deriveSessionName, getSessionName, setSessionForPath, getAllSessions, removeSessionForPath, getMessageUploadConfig, getContextRefreshConfig, getLocalContextConfig, getInjectionConfig, isLoggingEnabled, isPluginEnabled, setPluginEnabled, getKnownHosts, estimateTokens, truncateToTokens, getHonchoBaseUrlForEndpoint, getHonchoBaseUrl, getHonchoClientOptions, getEndpointInfo, getObservationMode, setEndpoint };

//# debugId=96FA23571EEDBD5964756E2164756E21
//# sourceMappingURL=chunk-084dpgp3.js.map
