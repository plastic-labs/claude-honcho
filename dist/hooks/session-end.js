#!/usr/bin/env bun

// src/config.ts
import { homedir as homedir2 } from "os";
import { join as join3, basename, dirname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync2, statSync, writeFileSync as writeFileSync2 } from "fs";

// src/git.ts
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
function isGitRepo(cwd) {
  return existsSync(join(cwd, ".git"));
}
function gitCommand(cwd, args) {
  try {
    return execSync(`git ${args}`, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}
function captureGitState(cwd) {
  if (!isGitRepo(cwd)) {
    return null;
  }
  const branch = gitCommand(cwd, "rev-parse --abbrev-ref HEAD") || "unknown";
  const commit = gitCommand(cwd, "rev-parse --short HEAD") || "unknown";
  const commitMessage = gitCommand(cwd, "log -1 --format=%s") || "";
  const statusOutput = gitCommand(cwd, "status --porcelain") || "";
  const isDirty = statusOutput.length > 0;
  const dirtyFiles = isDirty ? statusOutput.split(`
`).filter((line) => line.trim()).map((line) => line.slice(3).trim()).slice(0, 20) : [];
  return {
    branch,
    commit,
    commitMessage,
    isDirty,
    dirtyFiles,
    timestamp: new Date().toISOString()
  };
}

// src/cache.ts
import { homedir } from "os";
import { join as join2 } from "path";
import { existsSync as existsSync2, readFileSync, writeFileSync, mkdirSync } from "fs";
var CACHE_DIR = join2(homedir(), ".honcho");
var ID_CACHE_FILE = join2(CACHE_DIR, "cache.json");
var CONTEXT_CACHE_FILE = join2(CACHE_DIR, "context-cache.json");
function ensureCacheDir() {
  if (!existsSync2(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}
function loadIdCache() {
  ensureCacheDir();
  if (!existsSync2(ID_CACHE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(ID_CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}
function saveIdCache(cache) {
  ensureCacheDir();
  writeFileSync(ID_CACHE_FILE, JSON.stringify(cache, null, 2));
}
function setCachedSessionId(cwd, name, id, instanceId) {
  const cache = loadIdCache();
  if (!cache.sessions)
    cache.sessions = {};
  cache.sessions[cwd] = { name, id, updatedAt: new Date().toISOString(), instanceId };
  saveIdCache(cache);
}
function getLastActiveCwd() {
  const cache = loadIdCache();
  if (!cache.sessions)
    return null;
  let latest = null;
  for (const [cwd, entry] of Object.entries(cache.sessions)) {
    if (!latest || entry.updatedAt > latest.updatedAt) {
      latest = { cwd, updatedAt: entry.updatedAt };
    }
  }
  return latest?.cwd || null;
}
function getClaudeInstanceId() {
  const cache = loadIdCache();
  return cache.claudeInstanceId || null;
}
function setClaudeInstanceId(instanceId) {
  const cache = loadIdCache();
  cache.claudeInstanceId = instanceId;
  saveIdCache(cache);
}
function getInstanceIdForCwd(cwd) {
  const cache = loadIdCache();
  return cache.sessions?.[cwd]?.instanceId ?? null;
}
var CONTEXT_CACHE_KNOWN_KEYS = new Set([
  "claudeContext",
  "summaries",
  "messageCount"
]);
function loadContextCache() {
  ensureCacheDir();
  if (!existsSync2(CONTEXT_CACHE_FILE)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(CONTEXT_CACHE_FILE, "utf-8"));
    let cleaned = false;
    for (const key of Object.keys(raw)) {
      if (!CONTEXT_CACHE_KNOWN_KEYS.has(key)) {
        delete raw[key];
        cleaned = true;
      }
    }
    if (cleaned) {
      writeFileSync(CONTEXT_CACHE_FILE, JSON.stringify(raw, null, 2));
    }
    return raw;
  } catch {
    return {};
  }
}
function saveContextCache(cache) {
  ensureCacheDir();
  writeFileSync(CONTEXT_CACHE_FILE, JSON.stringify(cache, null, 2));
}
function incrementMessageCount() {
  const cache = loadContextCache();
  cache.messageCount = (cache.messageCount || 0) + 1;
  saveContextCache(cache);
  return cache.messageCount;
}
function getMessageCount() {
  const cache = loadContextCache();
  return cache.messageCount || 0;
}
function resetMessageCount() {
  const cache = loadContextCache();
  cache.messageCount = 0;
  saveContextCache(cache);
}
var GIT_STATE_FILE = join2(CACHE_DIR, "git-state.json");
function loadGitStateCache() {
  ensureCacheDir();
  if (!existsSync2(GIT_STATE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(GIT_STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}
function saveGitStateCache(cache) {
  ensureCacheDir();
  writeFileSync(GIT_STATE_FILE, JSON.stringify(cache, null, 2));
}
function getCachedGitState(cwd) {
  const cache = loadGitStateCache();
  return cache[cwd] || null;
}
function setCachedGitState(cwd, state) {
  const cache = loadGitStateCache();
  cache[cwd] = state;
  saveGitStateCache(cache);
}
function detectGitChanges(previous, current) {
  const changes = [];
  if (!previous) {
    changes.push({
      type: "initial",
      description: `Session started on branch '${current.branch}' at ${current.commit}`
    });
    return changes;
  }
  if (previous.branch !== current.branch) {
    changes.push({
      type: "branch_switch",
      description: `Branch switched from '${previous.branch}' to '${current.branch}'`,
      from: previous.branch,
      to: current.branch
    });
  }
  if (previous.commit !== current.commit) {
    changes.push({
      type: "new_commits",
      description: `New commit: ${current.commit} - ${current.commitMessage}`,
      from: previous.commit,
      to: current.commit
    });
  }
  if (!previous.isDirty && current.isDirty) {
    changes.push({
      type: "files_changed",
      description: `Uncommitted changes detected: ${current.dirtyFiles.slice(0, 5).join(", ")}${current.dirtyFiles.length > 5 ? "..." : ""}`
    });
  }
  return changes;
}
var MAX_MESSAGE_SIZE = 24000;
function chunkContent(content, maxSize = MAX_MESSAGE_SIZE) {
  if (content.length <= maxSize) {
    return [content];
  }
  const chunks = [];
  let remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= maxSize) {
      chunks.push(remaining);
      break;
    }
    let splitIndex = remaining.lastIndexOf(`
`, maxSize);
    if (splitIndex <= 0 || splitIndex < maxSize * 0.25) {
      splitIndex = remaining.lastIndexOf(" ", maxSize);
    }
    if (splitIndex <= 0 || splitIndex < maxSize * 0.25) {
      splitIndex = maxSize;
    }
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }
  if (chunks.length > 1) {
    return chunks.map((chunk, i) => `[Part ${i + 1}/${chunks.length}] ${chunk}`);
  }
  return chunks;
}
var HONCHO_MAX_BATCH = 100;
async function addMessagesBatched(session, messages, resolveFallback) {
  let active = session;
  let usedFallback = false;
  for (let i = 0;i < messages.length; i += HONCHO_MAX_BATCH) {
    const batch = messages.slice(i, i + HONCHO_MAX_BATCH);
    try {
      await active.addMessages(batch);
    } catch (e) {
      if (usedFallback || !resolveFallback)
        throw e;
      active = await resolveFallback(e);
      usedFallback = true;
      await active.addMessages(batch);
    }
  }
}
function clearIdCache() {
  ensureCacheDir();
  writeFileSync(ID_CACHE_FILE, "{}");
}
function clearPeerCache() {
  const cache = loadIdCache();
  delete cache.peers;
  saveIdCache(cache);
}
function clearUserContextOnly() {
  const cache = loadContextCache();
  delete cache.userContext;
  saveContextCache(cache);
}
function clearClaudeContextOnly() {
  const cache = loadContextCache();
  delete cache.claudeContext;
  saveContextCache(cache);
}
// node_modules/@honcho-ai/harness-plugin-core/src/telemetry.ts
var HEADER_HOST = "X-Honcho-Host";
var HEADER_PLUGIN = "X-Honcho-Plugin";
var HEADER_AGENT_MODEL = "X-Honcho-Agent-Model";
function sanitize(value) {
  if (typeof value !== "string")
    return;
  const s = value.replace(/[\r\n]+/g, " ").trim();
  return s || undefined;
}
function token(name, ver) {
  const clean = (v) => sanitize(v)?.replace(/[\s()/;]+/g, "-");
  const n = clean(name);
  const v = clean(ver);
  if (n && v)
    return `${n}/${v}`;
  return n || v;
}
function hostHeaderValue(id = {}) {
  const host = token(id.host, id.hostVersion);
  if (!host)
    return;
  const platform = token(id.platform ?? process.platform, undefined);
  return platform ? `${host} (${platform})` : host;
}
function pluginHeaderValue(id = {}) {
  return token(id.plugin, id.pluginVersion);
}
function telemetryHeaders(id = {}, extra) {
  const headers = {};
  const host = hostHeaderValue(id);
  const plugin = pluginHeaderValue(id);
  const model = sanitize(id.model);
  if (host)
    headers[HEADER_HOST] = host;
  if (plugin)
    headers[HEADER_PLUGIN] = plugin;
  if (model)
    headers[HEADER_AGENT_MODEL] = model;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      const value = sanitize(v);
      if (value)
        headers[k] = value;
    }
  }
  return headers;
}
// src/config.ts
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
var CONFIG_DIR = join3(homedir2(), ".honcho");
var CONFIG_FILE = join3(CONFIG_DIR, "config.json");
function getConfigPath() {
  return CONFIG_FILE;
}
function configExists() {
  return existsSync3(CONFIG_FILE);
}
function getPluginVersion() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const candidates = [
    ...root ? [join3(root, ".claude-plugin", "plugin.json")] : [],
    fileURLToPath(new URL("../.claude-plugin/plugin.json", import.meta.url))
  ];
  for (const manifest of candidates) {
    try {
      const version = JSON.parse(readFileSync2(manifest, "utf-8")).version;
      if (typeof version === "string" && version)
        return version;
    } catch {}
  }
  return "unknown";
}
function loadConfig2(host) {
  const resolvedHost = host ?? getDetectedHost();
  if (configExists()) {
    try {
      const content = readFileSync2(CONFIG_FILE, "utf-8");
      const raw = JSON.parse(content);
      return resolveConfig2(raw, resolvedHost);
    } catch {}
  }
  return loadConfigFromEnv(resolvedHost);
}
function resolveConfig2(raw, host) {
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
    redactPatterns: hostBlock?.redactPatterns ?? raw.redactPatterns,
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
  if (!existsSync3(CONFIG_DIR)) {
    mkdirSync2(CONFIG_DIR, { recursive: true });
  }
  let existing = {};
  if (existsSync3(CONFIG_FILE)) {
    try {
      existing = JSON.parse(readFileSync2(CONFIG_FILE, "utf-8"));
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
  setHostIfExplicit("redactPatterns", config.redactPatterns, existing.redactPatterns);
  setHostIfExplicit("endpoint", config.endpoint, existing.endpoint);
  setHostIfExplicit("injection", config.injection, existing.injection);
  setHostIfExplicit("rememberTool", config.rememberTool, existing.rememberTool);
  if (existingHost.apiKey !== undefined) {
    hostEntry.apiKey = existingHost.apiKey;
  }
  existing.hosts[host] = hostEntry;
  writeFileSync2(CONFIG_FILE, JSON.stringify(existing, null, 2));
}
function saveRootField(field, value) {
  if (!existsSync3(CONFIG_DIR)) {
    mkdirSync2(CONFIG_DIR, { recursive: true });
  }
  let existing = {};
  if (existsSync3(CONFIG_FILE)) {
    try {
      existing = JSON.parse(readFileSync2(CONFIG_FILE, "utf-8"));
    } catch {}
  }
  existing[field] = value;
  writeFileSync2(CONFIG_FILE, JSON.stringify(existing, null, 2));
}
function resolveWorktreeMainRoot(dir) {
  try {
    const gitPath = join3(dir, ".git");
    if (!statSync(gitPath).isFile())
      return null;
    const match = readFileSync2(gitPath, "utf-8").match(/^gitdir:\s*(.+?)\s*$/m);
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
      if (existsSync3(join3(dir, ".git")))
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
  const config = loadConfig2();
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
  const config = loadConfig2();
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
  const config = loadConfig2();
  if (!config)
    return;
  if (!config.sessions) {
    config.sessions = {};
  }
  config.sessions[cwd] = sessionName;
  saveConfig(config);
}
function getInjectionConfig(config) {
  const injection = (config === undefined ? loadConfig2() : config)?.injection;
  const resolved = { ...DEFAULT_INJECTION, ...injection ?? {} };
  resolved.perTurn = Array.isArray(resolved.perTurn) ? normalizePerTurn(resolved.perTurn) : DEFAULT_INJECTION.perTurn;
  resolved.showContents = Array.isArray(resolved.showContents) ? normalizePerTurn(resolved.showContents) : DEFAULT_INJECTION.showContents;
  return resolved;
}
function isLoggingEnabled() {
  const config = loadConfig2();
  return config?.logging !== false;
}
function isPluginEnabled() {
  const config = loadConfig2();
  return config?.enabled !== false;
}
function getKnownHosts() {
  const cfgPath = getConfigPath();
  if (!existsSync3(cfgPath))
    return [];
  try {
    const raw = JSON.parse(readFileSync2(cfgPath, "utf-8"));
    return raw.hosts ? Object.keys(raw.hosts) : [];
  } catch {
    return [];
  }
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
function getTelemetryHeaders(host = getDetectedHost()) {
  return telemetryHeaders({
    host: host.replace(/_/g, "-"),
    plugin: "claude-honcho",
    pluginVersion: getPluginVersion()
  });
}
function getHonchoClientOptions(config) {
  return {
    apiKey: config.apiKey,
    baseURL: getHonchoBaseUrl(config),
    workspaceId: config.workspace,
    timeout: 120000,
    maxRetries: 1,
    defaultHeaders: getTelemetryHeaders()
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

// src/state.ts
import { homedir as homedir3 } from "os";
import { join as join4 } from "path";
import { writeFileSync as writeFileSync3, unlinkSync } from "fs";
var DIR = join4(homedir3(), ".honcho");
function stateFile(sessionId) {
  return join4(DIR, sessionId ? `state-${sessionId}.json` : "state.json");
}
function sessionFile(sessionId) {
  return join4(DIR, sessionId ? `session-${sessionId}.json` : "session.json");
}
function setMemoryState(phase, detail, sessionId) {
  try {
    writeFileSync3(stateFile(sessionId), JSON.stringify({ phase, since: Date.now(), detail }));
  } catch {}
}
function setSessionLink(url, name, sessionId) {
  try {
    writeFileSync3(sessionFile(sessionId), JSON.stringify({ url, name }));
  } catch {}
}
function clearSessionFiles(sessionId) {
  if (!sessionId)
    return;
  for (const f of [stateFile(sessionId), sessionFile(sessionId)]) {
    try {
      unlinkSync(f);
    } catch {}
  }
}

// src/log.ts
import { homedir as homedir4 } from "os";
import { join as join5 } from "path";
import { existsSync as existsSync4, appendFileSync, mkdirSync as mkdirSync3, readFileSync as readFileSync3, statSync as statSync2, writeFileSync as writeFileSync4 } from "fs";

// src/unicode.ts
var blocks = {
  full: String.fromCodePoint(9608),
  upperHalf: String.fromCodePoint(9600),
  lowerHalf: String.fromCodePoint(9604),
  light: String.fromCodePoint(9617),
  medium: String.fromCodePoint(9618),
  dark: String.fromCodePoint(9619),
  lower1_8: String.fromCodePoint(9601),
  lower2_8: String.fromCodePoint(9602),
  lower3_8: String.fromCodePoint(9603),
  lower4_8: String.fromCodePoint(9604),
  lower5_8: String.fromCodePoint(9605),
  lower6_8: String.fromCodePoint(9606),
  lower7_8: String.fromCodePoint(9607)
};
var circles = {
  empty: String.fromCodePoint(9675),
  filled: String.fromCodePoint(9679),
  upperRight: String.fromCodePoint(9684),
  rightHalf: String.fromCodePoint(9681),
  lowerRight: String.fromCodePoint(9685),
  leftHalf: String.fromCodePoint(9680),
  upperHalf: String.fromCodePoint(9683),
  lowerHalf: String.fromCodePoint(9682)
};
var stars = {
  small: String.fromCodePoint(8902),
  sparkle1: String.fromCodePoint(10023),
  sparkle2: String.fromCodePoint(10022),
  sparkle3: String.fromCodePoint(8889),
  star6: String.fromCodePoint(10038),
  star4: String.fromCodePoint(10036),
  star8: String.fromCodePoint(10040)
};
var braille = {
  wave: [
    String.fromCodePoint(10494),
    String.fromCodePoint(10487),
    String.fromCodePoint(10479),
    String.fromCodePoint(10463),
    String.fromCodePoint(10367),
    String.fromCodePoint(10431),
    String.fromCodePoint(10491),
    String.fromCodePoint(10493)
  ],
  dots: [
    String.fromCodePoint(10251),
    String.fromCodePoint(10265),
    String.fromCodePoint(10297),
    String.fromCodePoint(10296),
    String.fromCodePoint(10300),
    String.fromCodePoint(10292),
    String.fromCodePoint(10278),
    String.fromCodePoint(10279),
    String.fromCodePoint(10247),
    String.fromCodePoint(10255)
  ]
};
var brackets = {
  angleLeft: String.fromCodePoint(10216),
  angleRight: String.fromCodePoint(10217)
};
var symbols = {
  check: String.fromCodePoint(10003),
  cross: String.fromCodePoint(10007),
  dot: String.fromCodePoint(183),
  bullet: String.fromCodePoint(8226),
  arrow: String.fromCodePoint(8594),
  line: String.fromCodePoint(9472),
  corner: String.fromCodePoint(9492),
  pipe: String.fromCodePoint(9474)
};
var arrows = {
  right: String.fromCodePoint(8594),
  left: String.fromCodePoint(8592),
  up: String.fromCodePoint(8593),
  down: String.fromCodePoint(8595),
  rightDouble: String.fromCodePoint(8658),
  leftDouble: String.fromCodePoint(8656),
  rightHook: String.fromCodePoint(8618),
  leftHook: String.fromCodePoint(8617)
};
var box = {
  horizontal: String.fromCodePoint(9472),
  vertical: String.fromCodePoint(9474),
  topLeft: String.fromCodePoint(9484),
  topRight: String.fromCodePoint(9488),
  bottomLeft: String.fromCodePoint(9492),
  bottomRight: String.fromCodePoint(9496),
  branchRight: String.fromCodePoint(9500),
  branchLeft: String.fromCodePoint(9508),
  branchDown: String.fromCodePoint(9516),
  branchUp: String.fromCodePoint(9524),
  cross: String.fromCodePoint(9532),
  cornerRight: String.fromCodePoint(9492)
};

// src/log.ts
var CACHE_DIR2 = join5(homedir4(), ".honcho");
var LOG_FILE = join5(CACHE_DIR2, "activity.log");
var MAX_LOG_SIZE = 100 * 1024;
var sym = {
  check: symbols.check,
  cross: symbols.cross,
  arrow: arrows.right,
  dot: symbols.bullet,
  circle: symbols.dot,
  branch: box.branchRight,
  corner: box.cornerRight,
  pipe: box.vertical,
  top: box.topRight,
  line: box.horizontal
};
function ensureLogDir() {
  if (!existsSync4(CACHE_DIR2)) {
    mkdirSync3(CACHE_DIR2, { recursive: true });
  }
}
var currentCwd = null;
var currentSession = null;
function setLogContext(cwd, session) {
  currentCwd = cwd;
  currentSession = session || null;
}
function logActivity(level, source, message, data, options) {
  if (!isLoggingEnabled())
    return;
  ensureLogDir();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    data,
    timing: options?.timing,
    success: options?.success,
    depth: options?.depth ?? 0,
    cwd: options?.cwd || currentCwd || undefined,
    session: options?.session || currentSession || undefined
  };
  try {
    if (existsSync4(LOG_FILE)) {
      const stats = statSync2(LOG_FILE).size;
      if (stats > MAX_LOG_SIZE) {
        const content = readFileSync3(LOG_FILE, "utf-8");
        const truncated = content.slice(-50 * 1024);
        writeFileSync4(LOG_FILE, truncated);
      }
    }
    appendFileSync(LOG_FILE, JSON.stringify(entry) + `
`);
  } catch {}
}
function logHook(hookName, message, data) {
  logActivity("hook", hookName, message, data);
}
function logApiCall(endpoint, method, details, timing, success) {
  const msg = `${method} ${endpoint}${details ? ` ${sym.arrow} ${details}` : ""}`;
  logActivity("api", "honcho", msg, undefined, { timing, success });
}
function logFlow(stage, message, data) {
  logActivity("flow", stage, message, data);
}
function logAsync(operation, message, results) {
  logActivity("async", operation, message, results ? { results } : undefined);
}

// src/hooks/session-end.ts
async function handleSessionEnd() {
  const config = loadConfig2();
  if (!config) {
    process.exit(0);
  }
  if (!isPluginEnabled()) {
    process.exit(0);
  }
  let hookInput = {};
  try {
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {}
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const reason = hookInput.reason || "unknown";
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);
  setLogContext(cwd, sessionName);
  logHook("session-end", `Session ending`, { reason });
  clearSessionFiles(hookInput.session_id);
  logHook("session-end", "Session ended — no upload (messages saved live)");
  process.exit(0);
}
async function main() {
  await initHook();
  await handleSessionEnd();
}

// hooks/session-end.ts
await main();

//# debugId=25E8FE3D837AA0DD64756E2164756E21
//# sourceMappingURL=session-end.js.map
