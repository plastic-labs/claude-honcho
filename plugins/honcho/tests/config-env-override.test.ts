import { describe, expect, test, beforeAll, afterAll, mock } from "bun:test";
import * as realOs from "os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// config.ts resolves ~/.honcho at import time, so os.homedir() is mocked
// to a temp dir before the module is loaded. Each test writes the config
// file it needs into that dir.
const home = mkdtempSync(join(tmpdir(), "honcho-env-"));
const savedEnv = { ...process.env };
let loadConfig: typeof import("../src/config").loadConfig;

beforeAll(async () => {
  mock.module("os", () => ({ ...realOs, homedir: () => home }));
  mkdirSync(join(home, ".honcho"), { recursive: true });
  ({ loadConfig } = await import("../src/config"));
});

afterAll(() => {
  process.env = savedEnv;
  rmSync(home, { recursive: true, force: true });
});

function writeConfig(config: Record<string, unknown>): void {
  writeFileSync(join(home, ".honcho", "config.json"), JSON.stringify(config));
}

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("HONCHO_")) delete process.env[key];
  }
}

describe("env overrides with a config file present", () => {
  test("HONCHO_AI_PEER overrides the hosts block", () => {
    resetEnv();
    writeConfig({
      apiKey: "k",
      peerName: "me",
      hosts: { claude_code: { workspace: "ws", aiPeer: "claude" } },
    });
    process.env.HONCHO_AI_PEER = "mx-lead";
    const config = loadConfig("claude_code");
    expect(config?.aiPeer).toBe("mx-lead");
    expect(config?.workspace).toBe("ws");
  });

  test("HONCHO_AI_PEER overrides a globalOverride aiPeer", () => {
    resetEnv();
    writeConfig({ apiKey: "k", peerName: "me", globalOverride: true, workspace: "ws", aiPeer: "claude" });
    process.env.HONCHO_AI_PEER = "mesh-lead";
    expect(loadConfig("claude_code")?.aiPeer).toBe("mesh-lead");
  });

  test("without HONCHO_AI_PEER the config file wins", () => {
    resetEnv();
    writeConfig({ apiKey: "k", peerName: "me", hosts: { claude_code: { aiPeer: "claude" } } });
    expect(loadConfig("claude_code")?.aiPeer).toBe("claude");
  });

  test("HONCHO_PEER_NAME still overrides peerName", () => {
    resetEnv();
    writeConfig({ apiKey: "k", peerName: "me" });
    process.env.HONCHO_PEER_NAME = "saulo";
    expect(loadConfig("claude_code")?.peerName).toBe("saulo");
  });
});
