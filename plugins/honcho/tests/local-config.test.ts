import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { hostname, tmpdir } from "os";
import { join } from "path";
import {
  getChatSessionName, getConfiguredOrigin, getLocalOverrides, getSessionName, isHonchoEnabled,
  isMessageSavingEnabled, loadConfig, loadGlobalConfig, refreshCredential, saveConfig, describeAuth,
} from "../src/config";
import { findLocalConfigDir, getLocalContext, readLocalSettings, setLocalConfigContext } from "../src/local-config";
import { getSessionScopes } from "../src/git";
import { groupIntoSessions, type ImportTarget } from "../src/skills/backfill";
import { transcriptCwd } from "../src/skills/transcript-parse";

const HOST = "claude_code";
const machine = hostname().split(".")[0].toLowerCase().replace(/[^a-z0-9-_]/g, "-");

let root: string;
let saved: NodeJS.ProcessEnv;

function writeJson(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

function project(dir: string, settings: unknown): string {
  const p = join(root, dir);
  writeJson(join(p, ".honcho", "config.json"), settings);
  return p;
}

function gitInit(dir: string) {
  mkdirSync(dir, { recursive: true });
  execSync("git init -q", { cwd: dir, stdio: "pipe" });
}

beforeEach(() => {
  saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith("HONCHO_")) delete process.env[k];
  delete process.env.CLAUDE_CODE_SESSION_ID;
  root = mkdtempSync(join(tmpdir(), "honcho-local-"));
  process.env.HOME = join(root, "home");
  process.env.HONCHO_CONFIG_PATH = join(root, "home", ".honcho", "config.json");
  writeJson(process.env.HONCHO_CONFIG_PATH, {
    hosts: { claude_code: { apiKey: "global-key", peerName: "alice", workspace: "global-ws", baseUrl: "http://honcho.lan:8000", schemaVersion: 2 } },
  });
  setLocalConfigContext(null, HOST);
});

afterEach(() => {
  setLocalConfigContext(null, HOST);
  process.env = saved;
  rmSync(root, { recursive: true, force: true });
});

describe("reading a repo-local file", () => {
  test("the host block wins over flat fields; 0.3.x endpoint and bad types are handled", () => {
    expect(readLocalSettings({
      workspace: "flat", aiPeer: "flat-ai", enabled: "no",
      endpoint: { baseUrl: "http://old.lan:8000/v3" },
      hosts: { "claude-code": { workspace: "block", splitSubmodules: true, sessionName: "  " } },
    }, HOST)).toEqual({ workspace: "block", aiPeer: "flat-ai", baseUrl: "http://old.lan:8000", splitSubmodules: true });
  });

  test("the nearest .honcho/config.json wins, and the global one is never repo-local", () => {
    const outer = project("outer", { workspace: "outer" });
    const inner = project("outer/inner", { workspace: "inner" });
    mkdirSync(join(inner, "src"), { recursive: true });
    expect(findLocalConfigDir(join(inner, "src"))).toBe(join(inner, ".honcho"));
    expect(findLocalConfigDir(join(outer, "docs"))).toBe(join(outer, ".honcho"));
    expect(findLocalConfigDir(join(root, "home", "notes"))).toBeNull();
  });
});

describe("config overlay", () => {
  test("without a repo-local file, config is the global one", () => {
    setLocalConfigContext(join(root, "plain"), HOST);
    expect(loadConfig()).toEqual(loadGlobalConfig());
    expect(loadConfig()?.localConfig).toBeUndefined();
    expect(getLocalOverrides()).toEqual([]);
  });

  test("repo-local fields override, the rest (credential included) inherit", () => {
    const p = project("app", { hosts: { claude_code: { workspace: "app-ws", aiPeer: "app-ai" } } });
    setLocalConfigContext(join(p, "src"), HOST);
    const cfg = loadConfig()!;
    expect(cfg).toMatchObject({ workspace: "app-ws", aiPeer: "app-ai", peerName: "alice", apiKey: "global-key", baseUrl: "http://honcho.lan:8000" });
    expect(cfg.localConfig).toEqual({ path: join(p, ".honcho", "config.json"), credential: false });
    expect(getLocalOverrides()).toEqual(["workspace", "aiPeer"]);
  });

  test("HONCHO_* env vars still win over the repo-local file", () => {
    const p = project("app", { workspace: "app-ws" });
    process.env.HONCHO_WORKSPACE = "env-ws";
    setLocalConfigContext(p, HOST);
    expect(loadConfig()?.workspace).toBe("env-ws");
  });

  test("a repo-local apiKey and server are used as written and never refreshed away", async () => {
    const p = project("selfhosted", { apiKey: "repo-key", baseUrl: "honcho.example.com" });
    setLocalConfigContext(p, HOST);
    const cfg = loadConfig()!;
    expect(cfg.apiKey).toBe("repo-key");
    expect(cfg.baseUrl).toBe("https://honcho.example.com");
    expect(getConfiguredOrigin()).toBe("https://honcho.example.com");
    await refreshCredential(cfg);
    expect(cfg.apiKey).toBe("repo-key");
    expect(describeAuth(cfg)).toContain(".honcho/config.json");
  });

  test("a self-contained repo-local file works with no global config", () => {
    rmSync(process.env.HONCHO_CONFIG_PATH!);
    const p = project("solo", { apiKey: "repo-key", workspace: "solo-ws" });
    setLocalConfigContext(p, HOST);
    expect(loadConfig()).toMatchObject({ apiKey: "repo-key", workspace: "solo-ws" });
    expect(loadGlobalConfig()).toBeNull();
  });

  test("a malformed repo-local file is ignored", () => {
    const p = join(root, "broken");
    mkdirSync(join(p, ".honcho"), { recursive: true });
    writeFileSync(join(p, ".honcho", "config.json"), "{ not json");
    setLocalConfigContext(p, HOST);
    expect(loadConfig()).toEqual(loadGlobalConfig());
  });

  test("saveConfig never copies a repo-local value into the global file", async () => {
    const p = project("app", { workspace: "app-ws", peerName: "repo-alice" });
    setLocalConfigContext(p, HOST);
    const before = JSON.parse(readFileSync(process.env.HONCHO_CONFIG_PATH!, "utf-8"));
    await saveConfig({ ...loadConfig()!, aiPeer: "new-ai" }, "aiPeer");
    const after = JSON.parse(readFileSync(process.env.HONCHO_CONFIG_PATH!, "utf-8"));
    expect(after.hosts.claude_code).toEqual({ ...before.hosts.claude_code, aiPeer: "new-ai" });
    expect(readFileSync(join(p, ".honcho", "config.json"), "utf-8")).toBe(JSON.stringify({ workspace: "app-ws", peerName: "repo-alice" }));
  });

  test("enabled and saveMessages switch the project off", () => {
    setLocalConfigContext(project("off", { hosts: { claude_code: { enabled: false } } }), HOST);
    expect(isHonchoEnabled()).toBe(false);
    expect(isMessageSavingEnabled()).toBe(false);
    setLocalConfigContext(project("quiet", { saveMessages: false }), HOST);
    expect(isHonchoEnabled()).toBe(true);
    expect(isMessageSavingEnabled()).toBe(false);
    setLocalConfigContext(join(root, "plain"), HOST);
    expect(isHonchoEnabled()).toBe(true);
    expect(isMessageSavingEnabled()).toBe(true);
  });
});

describe("sessions and scopes under a repo-local config", () => {
  test("without a pin, each chat keeps its own session", () => {
    setLocalConfigContext(project("app", { workspace: "app-ws" }), HOST);
    expect(getSessionName("Chat-1")).toBe("chat-1");
  });

  test("sessionName puts every chat in the project into one session", () => {
    const p = project("Notebook", { sessionName: "Alice Notebook" });
    setLocalConfigContext(join(p, "ios"), HOST);
    expect(getSessionName("chat-1")).toBe("alice-notebook");
    expect(getSessionName()).toBe("alice-notebook");
    expect(getChatSessionName("chat-1")).toBe("chat-1");
  });

  test("per-directory shares the project root's session; per-repo one per repository", () => {
    const shop = project("shop", { sessionStrategy: "per-directory" });
    gitInit(join(shop, "storefront"));
    setLocalConfigContext(join(shop, "storefront", "src"), HOST);
    expect(getSessionName("c")).toBe("shop");

    const mono = project("mono", { sessionStrategy: "per-repo" });
    gitInit(join(mono, "api"));
    mkdirSync(join(mono, "notes"), { recursive: true });
    setLocalConfigContext(join(mono, "api"), HOST);
    expect(getSessionName("c")).toBe("api");
    setLocalConfigContext(join(mono, "notes"), HOST);
    expect(getSessionName("c")).toBe("mono");
  });

  test("the repo scope is the project root's, or with splitSubmodules the nested repository's", () => {
    const p = project("workspace-root", { workspace: "w" });
    gitInit(join(p, "lib"));
    expect(getSessionScopes(join(p, "lib"))).toEqual(["workspace-root", machine]);

    writeJson(join(p, ".honcho", "config.json"), { workspace: "w", splitSubmodules: true });
    expect(getSessionScopes(join(p, "lib"))).toEqual(["lib", machine]);
    expect(getSessionScopes(join(p, "docs"))).toEqual(["workspace-root", machine]);
  });
});

describe("importing under repo-local configs", () => {
  function transcript(dir: string, id: string, cwd: string, text: string): string {
    const path = join(root, "transcripts", dir, `${id}.jsonl`);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, [
      { type: "user", sessionId: id, cwd, timestamp: "2026-11-01T00:00:00Z", message: { role: "user", content: text } },
      { type: "assistant", sessionId: id, cwd, timestamp: "2026-11-01T00:00:01Z", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n");
    return path;
  }

  test("finds a transcript's cwd without parsing it", () => {
    const path = transcript("p", "a", "/work/app", "hi");
    expect(transcriptCwd(path)).toBe("/work/app");
    expect(transcriptCwd(join(root, "missing.jsonl"))).toBeUndefined();
  });

  test("chats in a pinned project share its session; live chats are left out", () => {
    const p = project("Notebook", { sessionName: "alice-notebook", workspace: "nb" });
    setLocalConfigContext(p, HOST);
    const target: ImportTarget = { config: loadConfig()!, key: "nb", ledger: "nb", local: getLocalContext() };
    const a = transcript("s", "chat-a", p, "first");
    const b = transcript("s", "chat-b", join(p, "ios"), "second");
    const c = transcript("s", "chat-c", p, "third");
    const { groups, live } = groupIntoSessions(
      [a, b, c].map((path) => ({ path, mtimeMs: 1, target })),
      (_t, chat) => chat === "chat-c",
    );
    expect(live).toEqual(["chat-c"]);
    expect([...groups.values()].map((g) => [g.name, g.messages.length, g.scopes])).toEqual([["alice-notebook", 4, ["notebook", machine]]]);
  });

  test("without a target, transcripts group by chat as before", () => {
    const a = transcript("g", "chat-a", "/work/app", "first");
    const { groups } = groupIntoSessions([{ path: a, mtimeMs: 1 }]);
    expect([...groups.keys()]).toEqual(["chat-a"]);
  });
});
