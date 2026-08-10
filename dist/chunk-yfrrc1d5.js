var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

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
var CLAUDE_CONTEXT_FILE = join2(CACHE_DIR, "claude-context.md");
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
function loadClaudeLocalContext() {
  ensureCacheDir();
  if (!existsSync2(CLAUDE_CONTEXT_FILE)) {
    return "";
  }
  try {
    return readFileSync(CLAUDE_CONTEXT_FILE, "utf-8");
  } catch {
    return "";
  }
}
function saveClaudeLocalContext(content) {
  ensureCacheDir();
  writeFileSync(CLAUDE_CONTEXT_FILE, content);
}
function appendClaudeWork(workDescription) {
  ensureCacheDir();
  const timestamp = new Date().toISOString();
  const entry = `
- [${timestamp}] ${workDescription}`;
  let existing = loadClaudeLocalContext();
  if (!existing) {
    existing = `# CLAUDE Work Context

Auto-generated log of CLAUDE's recent work.

## Recent Activity
`;
  }
  let maxEntries = getLocalContextConfig().maxEntries;
  if (!maxEntries) {
    maxEntries = 10;
  }
  const lines = existing.split(`
`);
  const activityStart = lines.findIndex((l) => l.includes("## Recent Activity"));
  if (activityStart !== -1) {
    const header = lines.slice(0, activityStart + 1);
    const activities = lines.slice(activityStart + 1).filter((l) => l.trim());
    const recentActivities = activities.slice(-(maxEntries - 1));
    existing = [...header, ...recentActivities].join(`
`);
  }
  saveClaudeLocalContext(existing + entry);
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
function loadConfig(host) {
  const resolvedHost = host ?? getDetectedHost();
  if (configExists()) {
    try {
      const content = readFileSync2(CONFIG_FILE, "utf-8");
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
  setHostIfExplicit("localContext", config.localContext, existing.localContext);
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

export { __toESM, __commonJS, __export, captureGitState, SESSION_START_COMPONENTS, PER_TURN_COMPONENTS, normalizePerTurn, REASONING_LEVELS, setDetectedHost, getDetectedHost, coerceBoolean, getCachedStdin, readStdinText, initHook, getConfigPath, configExists, getPluginVersion, loadConfig, saveConfig, saveRootField, getSessionForPath, getSessionName, setSessionForPath, getInjectionConfig, isLoggingEnabled, isPluginEnabled, getKnownHosts, getHonchoClientOptions, getEndpointInfo, getObservationMode, setCachedSessionId, getLastActiveCwd, getClaudeInstanceId, setClaudeInstanceId, getInstanceIdForCwd, incrementMessageCount, getMessageCount, resetMessageCount, appendClaudeWork, getCachedGitState, setCachedGitState, detectGitChanges, chunkContent, addMessagesBatched, clearIdCache, clearPeerCache, clearUserContextOnly, clearClaudeContextOnly };

//# debugId=05755442764F032B64756E2164756E21
//# sourceMappingURL=chunk-yfrrc1d5.js.map
