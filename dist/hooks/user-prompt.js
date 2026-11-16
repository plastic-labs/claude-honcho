#!/usr/bin/env bun

// src/hooks/user-prompt.ts
import { readFileSync as readFileSync6, existsSync as existsSync6 } from "node:fs";
import { join as join7 } from "node:path";

// src/config.ts
import { join as join3, dirname as dirname2 } from "path";
import { fileURLToPath } from "url";
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "fs";

// node_modules/@honcho-ai/harness-plugin-core/dist/config.js
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// node_modules/@honcho-ai/harness-plugin-core/dist/legacy/v01.js
var isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var str = (v) => typeof v === "string" && v ? v : undefined;
function v01Reader(file, host) {
  const hosts = isObj(file.hosts) ? file.hosts : {};
  const v1 = typeof file.schemaVersion === "number" && file.schemaVersion >= 1;
  const pick = (b) => {
    const o = isObj(b) ? b : {};
    if (v1)
      return { apiKey: isObj(o.auth) ? str(o.auth.apiKey) : undefined, peerName: str(o.peerName), workspace: str(o.workspace), baseUrl: str(o.baseUrl) };
    return {
      apiKey: (isObj(o.auth) ? str(o.auth.apiKey) : undefined) ?? str(o.apiKey),
      peerName: str(o.peerName),
      workspace: str(o.workspace) ?? str(o.workspaceId),
      baseUrl: str(o.baseUrl) ?? str(o.environmentUrl) ?? (isObj(o.endpoint) ? str(o.endpoint.baseUrl) : undefined)
    };
  };
  const own = pick(hosts[host]);
  const top = pick(file);
  return {
    apiKey: own.apiKey ?? top.apiKey,
    peerName: own.peerName ?? top.peerName,
    workspace: own.workspace ?? top.workspace,
    aiPeer: isObj(hosts[host]) ? str(hosts[host].aiPeer) : undefined,
    baseUrl: own.baseUrl ?? top.baseUrl
  };
}

// node_modules/@honcho-ai/harness-plugin-core/dist/oauth.js
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
var OAUTH_TOKEN_URL = "https://api.honcho.dev/oauth/token";
var OAUTH_SCOPE = "write";
var REQUEST_TIMEOUT_MS = 1e4;
var REFRESH_SKEW_S = 60;
var LOCK_STALE_MS = REQUEST_TIMEOUT_MS + 5000;
var LOCK_WAIT_MS = LOCK_STALE_MS + 5000;
var PERMANENT_ERRORS = new Set(["invalid_grant", "invalid_client", "unauthorized_client"]);

class OAuthError extends Error {
  code;
  constructor(code, description) {
    super(description || code);
    this.code = code;
    this.name = "OAuthError";
  }
}
function isCloud(baseUrl) {
  return normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL) === DEFAULT_BASE_URL;
}
function accessValid(t, skewS = REFRESH_SKEW_S, nowS = Date.now() / 1000) {
  return !!t?.accessToken && nowS < t.accessExpiresAt - skewS;
}
async function post(url, form, t) {
  const f = t?.fetch ?? fetch;
  let res;
  try {
    res = await f(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (e) {
    throw new OAuthError("connection_error", `could not reach ${url}: ${e.message}`);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}
function errorOf(r) {
  const b = r.body;
  if (b && typeof b === "object" && typeof b.error === "string")
    return new OAuthError(b.error, b.error_description);
  return new OAuthError("invalid_response");
}
function tokensFrom(body, clientId, prev) {
  if (!body || typeof body.access_token !== "string" || !Number.isFinite(Number(body.expires_in))) {
    throw new OAuthError("invalid_response", "malformed token response");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || prev?.refreshToken || "",
    accessExpiresAt: Math.floor(Date.now() / 1000) + Number(body.expires_in),
    clientId,
    scope: body.scope || prev?.scope || OAUTH_SCOPE
  };
}
async function refreshAccessToken(prev, opts = {}) {
  const r = await post(opts.tokenUrl ?? OAUTH_TOKEN_URL, { grant_type: "refresh_token", refresh_token: prev.refreshToken, client_id: prev.clientId }, opts);
  if (r.status !== 200)
    throw errorOf(r);
  return tokensFrom(r.body, prev.clientId, prev);
}
function isObj2(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function asTokens(v) {
  if (!isObj2(v) || typeof v.accessToken !== "string" || !v.accessToken)
    return;
  return {
    accessToken: v.accessToken,
    refreshToken: typeof v.refreshToken === "string" ? v.refreshToken : "",
    accessExpiresAt: Number(v.accessExpiresAt) || 0,
    clientId: typeof v.clientId === "string" ? v.clientId : "",
    scope: typeof v.scope === "string" ? v.scope : ""
  };
}
function readFile(path) {
  if (!existsSync(path))
    return {};
  const parsed = JSON.parse(readFileSync(path, "utf-8"));
  return isObj2(parsed) ? parsed : {};
}
function readGrant(file, host, legacy) {
  return asTokens(effectiveBlock(file, host, legacy).oauth);
}
function holderAlive(token, ageMs) {
  if (token === "")
    return ageMs < 1000;
  const pid = Number(token.split(":")[0]);
  if (!Number.isInteger(pid) || pid <= 0)
    return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
async function withConfigLock(path, fn) {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  const start = Date.now();
  let fd;
  while (fd === undefined) {
    try {
      fd = openSync(lock, "wx", 384);
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      try {
        const age = Date.now() - statSync(lock).mtimeMs;
        if (age > LOCK_STALE_MS || !holderAlive(readFileSync(lock, "utf-8"), age))
          unlinkSync(lock);
      } catch {}
      if (Date.now() - start > LOCK_WAIT_MS)
        throw new Error(`timed out waiting for ${lock}`);
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
    }
  }
  const token = `${process.pid}:${Math.random().toString(36).slice(2)}`;
  try {
    writeFileSync(fd, token);
    return await fn();
  } finally {
    closeSync(fd);
    try {
      if (readFileSync(lock, "utf-8") === token)
        unlinkSync(lock);
    } catch {}
  }
}
function writeFileAtomic(path, data) {
  const tmp = join(dirname(path), `.${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`);
  writeFileSync(tmp, JSON.stringify(data, null, 2) + `
`, { mode: 384 });
  renameSync(tmp, path);
}
async function updateConfigFile(path, mutate) {
  await withConfigLock(path, async () => {
    const file = readFile(path);
    mutate(file);
    writeFileAtomic(path, file);
  });
}
function setGrant(file, host, tokens) {
  const block = hostBlock(file, host);
  if (tokens)
    block.oauth = tokens;
  else
    delete block.oauth;
}
function serverOf(block, baseUrl, env) {
  return baseUrl ?? (env.HONCHO_BASE_URL || undefined) ?? (typeof block.baseUrl === "string" && block.baseUrl ? block.baseUrl : undefined);
}
function pickCredential(file, opts) {
  const env = opts.env ?? process.env;
  if (env.HONCHO_API_KEY)
    return { token: env.HONCHO_API_KEY, source: "env" };
  const block = effectiveBlock(file, opts.host, opts.legacy);
  const g = isCloud(serverOf(block, opts.baseUrl, env)) ? asTokens(block.oauth) : undefined;
  if (g)
    return { token: g.accessToken, source: "oauth", expiresAt: g.accessExpiresAt, ...accessValid(g, 0) ? {} : { expired: true } };
  return typeof block.apiKey === "string" && block.apiKey ? { token: block.apiKey, source: "apiKey" } : null;
}
async function ensureFreshCredential(opts) {
  const env = opts.env ?? process.env;
  if (env.HONCHO_API_KEY)
    return { token: env.HONCHO_API_KEY, source: "env" };
  let file;
  try {
    file = readFile(opts.path);
  } catch {
    file = {};
  }
  const block = effectiveBlock(file, opts.host, opts.legacy);
  const g = isCloud(serverOf(block, opts.baseUrl, env)) ? asTokens(block.oauth) : undefined;
  if (!g || accessValid(g) || !g.refreshToken)
    return pickCredential(file, opts);
  let error;
  try {
    await withConfigLock(opts.path, async () => {
      const current = readGrant(readFile(opts.path), opts.host, opts.legacy);
      if (!current || accessValid(current))
        return;
      const next = await refreshAccessToken(current, opts);
      const latest = readFile(opts.path);
      setGrant(latest, opts.host, next);
      writeFileAtomic(opts.path, latest);
    });
  } catch (e) {
    error = e instanceof OAuthError ? e.code : e.message;
  }
  try {
    file = readFile(opts.path);
  } catch {}
  const cred = pickCredential(file, opts);
  if (cred && error) {
    cred.error = error;
    if (PERMANENT_ERRORS.has(error))
      cred.reauthRequired = true;
  }
  return cred;
}

// node_modules/@honcho-ai/harness-plugin-core/dist/config.js
var DEFAULT_BASE_URL = "https://api.honcho.dev";
var CONFIG_SCHEMA_VERSION = 2;
function isObj3(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function str2(v) {
  return typeof v === "string" && v ? v : undefined;
}
function normalizeBaseUrl(input) {
  let s = input.trim();
  if (!s)
    return s;
  if (!s.startsWith("http://") && !s.startsWith("https://")) {
    const host = s.split("/")[0].split(":")[0].toLowerCase();
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
    s = `${local ? "http" : "https"}://${s}`;
  }
  try {
    const u = new URL(s);
    u.hostname = u.hostname.toLowerCase();
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return s;
  }
}
function resolveConfig(file, opts) {
  const env = opts.env ?? process.env;
  const { host } = opts;
  const block = effectiveBlock(file, host, opts.legacy);
  return {
    host,
    peerName: str2(env.HONCHO_PEER_NAME) ?? str2(block.peerName) ?? str2(env.USER) ?? str2(env.USERNAME) ?? "user",
    workspace: str2(env.HONCHO_WORKSPACE) ?? str2(block.workspace) ?? opts.defaults?.workspace ?? host,
    aiPeer: str2(env.HONCHO_AI_PEER) ?? str2(block.aiPeer) ?? opts.defaults?.aiPeer ?? host,
    baseUrl: normalizeBaseUrl(str2(env.HONCHO_BASE_URL) ?? str2(block.baseUrl) ?? DEFAULT_BASE_URL),
    warnings: checkConfig(file).map((i) => i.message)
  };
}
function configPath(env = process.env) {
  if (env.HONCHO_CONFIG_PATH)
    return env.HONCHO_CONFIG_PATH;
  const home = env.HOME || env.USERPROFILE || homedir();
  return join2(home, ".honcho", "config.json");
}
function readConfigFile(env = process.env) {
  const path = configPath(env);
  if (!existsSync2(path))
    return {};
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf-8"));
    return isObj3(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
async function saveHost(path, host, patch, legacy) {
  await updateConfigFile(path, (file) => {
    if (isNewer(file))
      throw new Error(`${path} was written by a newer Honcho plugin; update this one.`);
    const block = writeBlock(file, host, hostMigration(file, host, [], legacy));
    if ("baseUrl" in patch && !("apiKey" in patch) && !sameServer(patch.baseUrl, str2(block.baseUrl)))
      delete block.apiKey;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined)
        delete block[k];
      else
        block[k] = v;
    }
    block.schemaVersion = CONFIG_SCHEMA_VERSION;
  });
}
var MOVABLE = ["apiKey", "peerName", "workspace", "aiPeer", "baseUrl"];
function isNewer(file) {
  return isObj3(file) && typeof file.schemaVersion === "number" && file.schemaVersion > CONFIG_SCHEMA_VERSION;
}
function isMigrated(block) {
  return isObj3(block) && typeof block.schemaVersion === "number" && block.schemaVersion >= CONFIG_SCHEMA_VERSION;
}
function sameServer(a, b) {
  return normalizeBaseUrl(a ?? DEFAULT_BASE_URL) === normalizeBaseUrl(b ?? DEFAULT_BASE_URL);
}
var LEGACY_HOST_KEYS = ["auth", "endpoint", "environmentUrl", "workspaceId"];
function isGrant(v) {
  return isObj3(v) && typeof v.accessToken === "string" && v.accessToken !== "";
}
function legacyGrantOf(b) {
  return !isGrant(b.oauth) && isObj3(b.auth) && isObj3(b.auth.oauth) ? b.auth.oauth : undefined;
}
function checkConfig(file) {
  if (!isObj3(file))
    return [];
  if (isNewer(file)) {
    return [{ path: "schemaVersion", message: `This file is schema version ${file.schemaVersion}, newer than this plugin understands; update the plugin.` }];
  }
  const issues = [];
  const hosts = isObj3(file.hosts) ? file.hosts : {};
  const byWorkspace = new Map;
  for (const h of Object.keys(hosts).filter((k) => isObj3(hosts[k]))) {
    const block = hosts[h];
    const peer = str2(block.peerName);
    if (!peer)
      continue;
    const ws = str2(block.workspace) ?? h;
    const peers = byWorkspace.get(ws) ?? new Map;
    peers.set(peer, [...peers.get(peer) ?? [], h]);
    byWorkspace.set(ws, peers);
  }
  for (const [ws, peers] of byWorkspace) {
    if (peers.size < 2)
      continue;
    const list = [...peers].map(([p, hs]) => `${hs.join(", ")}: "${p}"`).join("; ");
    issues.push({ path: "hosts", message: `Hosts in workspace "${ws}" use different peerNames (${list}), so the user is split across peers.` });
  }
  return issues;
}
function hostMigration(file, host, deadKeys = [], legacy = v01Reader) {
  if (isNewer(file))
    return { set: {}, remove: [] };
  const f = isObj3(file) ? file : {};
  const hosts = isObj3(f.hosts) ? f.hosts : {};
  const block = isObj3(hosts[host]) ? hosts[host] : {};
  const set = {};
  const drop = [];
  const grant = legacyGrantOf(block);
  if (grant)
    set.oauth = grant;
  if (!isMigrated(block)) {
    const old = { ...legacy(f, host) };
    const signedIn = isGrant(block.oauth) || grant !== undefined;
    if (old.baseUrl && sameServer(old.baseUrl, undefined))
      old.baseUrl = undefined;
    for (const key of MOVABLE) {
      if (signedIn && (key === "apiKey" || key === "baseUrl"))
        continue;
      if (old[key] !== undefined && block[key] !== old[key])
        set[key] = old[key];
      else if (old[key] === undefined && block[key] !== undefined)
        drop.push(key);
    }
    set.schemaVersion = CONFIG_SCHEMA_VERSION;
  }
  const remove = [...drop, ...LEGACY_HOST_KEYS, ...deadKeys].filter((k) => (k in block) && !(k in set));
  return { set, remove };
}
function effectiveBlock(file, host, legacy) {
  return writeBlock(structuredClone(isObj3(file) ? file : {}), host, hostMigration(file, host, [], legacy));
}
function hostBlock(file, host) {
  if (host === "__proto__" || host === "constructor" || host === "prototype")
    throw new Error(`invalid host name: ${host}`);
  if (!isObj3(file.hosts))
    file.hosts = {};
  return isObj3(file.hosts[host]) ? file.hosts[host] : file.hosts[host] = {};
}
function writeBlock(file, host, { set, remove }) {
  const block = hostBlock(file, host);
  Object.assign(block, set);
  for (const k of remove)
    delete block[k];
  return block;
}
async function migrateHost(path, host, deadKeys = [], legacy) {
  const peek = hostMigration(readConfigFile({ HONCHO_CONFIG_PATH: path }), host, deadKeys, legacy);
  if (!Object.keys(peek.set).length && !peek.remove.length)
    return [];
  let changed = [];
  await updateConfigFile(path, (file) => {
    const m = hostMigration(file, host, deadKeys, legacy);
    changed = [...Object.keys(m.set).filter((k) => k !== "schemaVersion"), ...m.remove.map((k) => `-${k}`)];
    if (Object.keys(m.set).length || m.remove.length)
      writeBlock(file, host, m);
  });
  return changed;
}
// node_modules/@honcho-ai/harness-plugin-core/dist/legacy/claude-honcho.js
var isObj4 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var str3 = (v) => typeof v === "string" && v ? v : undefined;
function claudeHonchoReader(file, host) {
  const hosts = isObj4(file.hosts) ? file.hosts : {};
  const found = hosts[host] ?? hosts[host.replace(/_/g, "-")] ?? hosts[host.replace(/-/g, "_")];
  const block = isObj4(found) ? found : undefined;
  const endpoint = block?.endpoint ?? file.endpoint;
  const override = file.globalOverride === true;
  return {
    apiKey: str3(block?.apiKey) ?? str3(file.apiKey),
    baseUrl: str3(endpoint?.baseUrl)?.replace(/\/v3\/?$/, "") ?? (endpoint?.environment === "local" ? "http://localhost:8000" : undefined),
    peerName: str3(file.peerName),
    workspace: str3(override || !block ? file.workspace : block.workspace),
    aiPeer: str3(override ? file.aiPeer ?? block?.aiPeer : block ? block.aiPeer : file[host === "cursor" ? "cursorPeer" : "claudePeer"])
  };
}
// node_modules/@honcho-ai/harness-plugin-core/dist/telemetry.js
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
var LEGACY = claudeHonchoReader;
function sanitizeForSessionName(s) {
  return s.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}
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
function getConfigPath() {
  return configPath();
}
function getConfigDir() {
  return dirname2(configPath());
}
function configExists() {
  return existsSync3(configPath());
}
function getPluginVersion() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const candidates = [
    ...root ? [join3(root, ".claude-plugin", "plugin.json")] : [],
    fileURLToPath(new URL("../.claude-plugin/plugin.json", import.meta.url))
  ];
  for (const manifest of candidates) {
    try {
      const version = JSON.parse(readFileSync3(manifest, "utf-8")).version;
      if (typeof version === "string" && version)
        return version;
    } catch {}
  }
  return "unknown";
}
function legacyEndpoint(value) {
  if (value === "local")
    return "http://localhost:8000";
  if (value?.startsWith("http"))
    return value.replace(/\/v3\/?$/, "");
  return;
}
function legacyEnv(host = getDetectedHost()) {
  const env = process.env;
  const peerVar = host === "cursor" ? "HONCHO_CURSOR_PEER" : "HONCHO_CLAUDE_PEER";
  const candidates = [
    ["HONCHO_BASE_URL", "baseUrl", "HONCHO_ENDPOINT", legacyEndpoint(env.HONCHO_ENDPOINT)],
    ["HONCHO_AI_PEER", "aiPeer", peerVar, env[peerVar] || undefined]
  ];
  const set = candidates.filter(([newVar, , , value]) => value && !env[newVar]);
  if (!set.length)
    return {};
  const block = effectiveBlock(readConfigFile(), host, LEGACY);
  if (block.apiKey || block.oauth)
    return {};
  return Object.fromEntries(set.filter(([, setting]) => !block[setting]).map(([newVar, , oldVar, value]) => [newVar, [oldVar, value]]));
}
function honchoEnv(host) {
  const legacy = Object.entries(legacyEnv(host));
  if (!legacy.length)
    return process.env;
  return { ...process.env, ...Object.fromEntries(legacy.map(([k, [, value]]) => [k, value])) };
}
function resolveHost(host) {
  return resolveConfig(readConfigFile(), {
    host,
    env: honchoEnv(host),
    defaults: { workspace: DEFAULT_WORKSPACE[host], aiPeer: DEFAULT_AI_PEER[host] },
    legacy: LEGACY
  });
}
function isLoggingEnabled(host = getDetectedHost()) {
  if (process.env.HONCHO_LOGGING === "false")
    return false;
  const file = readConfigFile();
  const hosts = file.hosts && typeof file.hosts === "object" ? file.hosts : {};
  const own = [hosts[host], hosts[host.replace(/_/g, "-")]].map((block) => block && typeof block === "object" ? block.logging : undefined).find((v) => v !== undefined);
  return (own ?? file.logging) !== false;
}
function loadConfig2(host = getDetectedHost()) {
  const cfg = resolveHost(host);
  const cred = pickCredential(readConfigFile(), { host, baseUrl: cfg.baseUrl, env: honchoEnv(host), legacy: LEGACY });
  if (!cred)
    return null;
  const { token, ...authState } = cred;
  return {
    apiKey: token,
    auth: { ...authState, host },
    peerName: cfg.peerName,
    workspace: cfg.workspace,
    aiPeer: cfg.aiPeer,
    baseUrl: cfg.baseUrl
  };
}
async function saveConfig(config, field) {
  const host = getDetectedHost();
  const env = honchoEnv(host);
  const write = (key, envVar) => key === field || !env[envVar];
  const patch = {};
  if (write("peerName", "HONCHO_PEER_NAME"))
    patch.peerName = config.peerName;
  if (write("workspace", "HONCHO_WORKSPACE"))
    patch.workspace = config.workspace === DEFAULT_WORKSPACE[host] ? undefined : config.workspace;
  if (write("aiPeer", "HONCHO_AI_PEER"))
    patch.aiPeer = config.aiPeer === DEFAULT_AI_PEER[host] ? undefined : config.aiPeer;
  if (write("baseUrl", "HONCHO_BASE_URL"))
    patch.baseUrl = config.baseUrl === DEFAULT_BASE_URL ? undefined : config.baseUrl;
  await saveHost(configPath(), host, patch, LEGACY);
}
function getConfigIssues(host = getDetectedHost()) {
  return checkConfig(readConfigFile()).filter((i) => i.path === "schemaVersion" || i.path === "hosts" && i.message.includes(host)).map((i) => i.message);
}
var DEAD_HOST_KEYS = [
  "sessionStrategy",
  "sessionPeerPrefix",
  "sessions",
  "injection",
  "contextRefresh",
  "messageUpload",
  "reasoningLevel",
  "statusline",
  "saveToolUse",
  "saveGitEvents",
  "redactPatterns",
  "rememberTool",
  "observationMode",
  "saveMessages",
  "enabled",
  "globalOverride",
  "linkedHosts"
];
async function migrateConfig(host = getDetectedHost()) {
  try {
    const changed = await migrateHost(configPath(), host, DEAD_HOST_KEYS, LEGACY);
    if (changed.length)
      return `[honcho] Moved your Honcho settings into hosts.${host} in ~/.honcho/config.json.`;
  } catch {}
  return;
}
function getSessionName(sessionId) {
  const id = sessionId || process.env.CLAUDE_CODE_SESSION_ID;
  return id ? sanitizeForSessionName(id) : null;
}
function getKnownHosts() {
  const hosts = readConfigFile().hosts;
  return hosts && typeof hosts === "object" ? Object.keys(hosts) : [];
}
async function refreshCredential(config) {
  const host = config.auth?.host ?? getDetectedHost();
  const cred = await ensureFreshCredential({ path: configPath(), host, baseUrl: config.baseUrl, env: honchoEnv(host), legacy: LEGACY });
  if (!cred)
    return;
  const { token, ...authState } = cred;
  config.apiKey = token;
  config.auth = { ...authState, host };
}
function getAuthNotice(config) {
  if (config.auth?.reauthRequired) {
    return "[honcho] Your Honcho sign-in has expired. Run /honcho setup to sign in again.";
  }
  return;
}
function getHonchoBaseUrl(config) {
  return `${config.baseUrl}/v3`;
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
function isProductionEndpoint(config) {
  return config.baseUrl === DEFAULT_BASE_URL;
}
function getEndpointInfo(config) {
  return { type: isProductionEndpoint(config) ? "production" : "custom", url: config.baseUrl };
}

// src/cache.ts
import { homedir as homedir2 } from "os";
import { join as join4 } from "path";
import { existsSync as existsSync4, readFileSync as readFileSync4, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "fs";
var CACHE_DIR = join4(homedir2(), ".honcho");
var CONTEXT_CACHE_FILE = join4(CACHE_DIR, "context-cache.json");
function ensureCacheDir() {
  if (!existsSync4(CACHE_DIR)) {
    mkdirSync2(CACHE_DIR, { recursive: true });
  }
}
var CONTEXT_CACHE_KNOWN_KEYS = new Set(["messageCount"]);
function loadContextCache() {
  ensureCacheDir();
  if (!existsSync4(CONTEXT_CACHE_FILE)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync4(CONTEXT_CACHE_FILE, "utf-8"));
    let cleaned = false;
    for (const key of Object.keys(raw)) {
      if (!CONTEXT_CACHE_KNOWN_KEYS.has(key)) {
        delete raw[key];
        cleaned = true;
      }
    }
    if (cleaned) {
      writeFileSync2(CONTEXT_CACHE_FILE, JSON.stringify(raw, null, 2));
    }
    return raw;
  } catch {
    return {};
  }
}
function saveContextCache(cache) {
  ensureCacheDir();
  writeFileSync2(CONTEXT_CACHE_FILE, JSON.stringify(cache, null, 2));
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

// src/log.ts
import { homedir as homedir3 } from "os";
import { join as join5 } from "path";
import { existsSync as existsSync5, appendFileSync, mkdirSync as mkdirSync3, readFileSync as readFileSync5, statSync as statSync2, writeFileSync as writeFileSync3 } from "fs";

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
var CACHE_DIR2 = join5(homedir3(), ".honcho");
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
  if (!existsSync5(CACHE_DIR2)) {
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
    if (existsSync5(LOG_FILE)) {
      const stats = statSync2(LOG_FILE).size;
      if (stats > MAX_LOG_SIZE) {
        const content = readFileSync5(LOG_FILE, "utf-8");
        const truncated = content.slice(-50 * 1024);
        writeFileSync3(LOG_FILE, truncated);
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

// src/styles.ts
var symbols2 = {
  check: String.fromCodePoint(10003),
  cross: String.fromCodePoint(10007),
  dot: String.fromCodePoint(183),
  bullet: String.fromCodePoint(8226),
  arrow: String.fromCodePoint(8594),
  line: String.fromCodePoint(9472),
  corner: String.fromCodePoint(9492),
  pipe: String.fromCodePoint(9474),
  sparkle: String.fromCodePoint(10022)
};
function honchoSessionUrl(config, sessionName) {
  if (!isProductionEndpoint(config))
    return null;
  return `https://app.honcho.dev/explore?workspace=${encodeURIComponent(config.workspace)}&view=sessions&session=${encodeURIComponent(sessionName)}`;
}

// src/state.ts
import { homedir as homedir4 } from "os";
import { join as join6 } from "path";
import { writeFileSync as writeFileSync4, unlinkSync as unlinkSync2 } from "fs";
var DIR = join6(homedir4(), ".honcho");
function sessionFile(sessionId) {
  return join6(DIR, `session-${sessionId}.json`);
}
function noticeFile(sessionId) {
  return join6(DIR, `notice-${sessionId}.json`);
}
function isModActive() {
  return process.env.HONCHO_MOD_UI === "1";
}
function setNotice(text, sessionId) {
  try {
    writeFileSync4(noticeFile(sessionId), JSON.stringify({ text }));
  } catch {}
}
function setSessionLink(url, name, sessionId) {
  if (!sessionId)
    return;
  try {
    writeFileSync4(sessionFile(sessionId), JSON.stringify({ url, name }));
  } catch {}
}
function clearSessionFiles(sessionId) {
  if (!sessionId)
    return;
  for (const f of [sessionFile(sessionId), noticeFile(sessionId)]) {
    try {
      unlinkSync2(f);
    } catch {}
  }
}

// src/hooks/user-prompt.ts
function formatSessionLink(sessionUrl) {
  return `view your session in honcho GUI: ${sessionUrl}`;
}
function readVersionNag() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir)
    return;
  const flag = join7(dataDir, ".version-stale");
  if (!existsSync6(flag))
    return;
  try {
    return readFileSync6(flag, "utf8").trim() || undefined;
  } catch {
    return;
  }
}
async function handleUserPrompt() {
  const config = loadConfig2();
  if (!config) {
    process.exit(0);
  }
  let hookInput = {};
  try {
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    process.exit(0);
  }
  const prompt = hookInput.prompt || "";
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const sessionName = getSessionName(hookInput.session_id);
  setLogContext(cwd, sessionName ?? undefined);
  if (!sessionName) {
    logHook("user-prompt", "No Claude Code session id; skipping");
    process.exit(0);
  }
  if (!prompt.trim()) {
    process.exit(0);
  }
  const sessionUrl = honchoSessionUrl(config, sessionName);
  setSessionLink(sessionUrl, sessionName, hookInput.session_id);
  const messageCountBefore = getMessageCount();
  incrementMessageCount();
  if (isModActive()) {
    const nag = messageCountBefore === 0 ? readVersionNag() : undefined;
    if (nag && hookInput.session_id)
      setNotice(nag, hookInput.session_id);
    process.exit(0);
  }
  const nag = readVersionNag();
  const link = sessionUrl ? formatSessionLink(sessionUrl) : undefined;
  const banner = messageCountBefore === 0 ? nag ?? link : messageCountBefore === 1 && nag ? link : undefined;
  if (banner)
    console.log(JSON.stringify({ systemMessage: banner }));
  process.exit(0);
}
async function main() {
  await initHook();
  await handleUserPrompt();
}

// hooks/user-prompt.ts
await main();

//# debugId=D4ED97F3A4A6F8E164756E2164756E21
//# sourceMappingURL=user-prompt.js.map
