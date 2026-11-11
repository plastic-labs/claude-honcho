import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getHonchoClientOptions, getTelemetryHeaders, isLoggingEnabled, loadConfig, migrateConfig,
} from "../src/config";

describe("telemetry headers", () => {
  test("identify host and plugin, omit the agent model", () => {
    const headers = getTelemetryHeaders("claude_code");
    expect(headers["X-Honcho-Host"]).toBe(`claude-code (${process.platform})`);
    expect(headers["X-Honcho-Plugin"]).toMatch(/^claude-honcho\/\d+\.\d+\.\d+/);
    expect(headers["X-Honcho-Agent-Model"]).toBeUndefined();
  });

  test("ride along on every client's default headers", () => {
    const opts = getHonchoClientOptions({ apiKey: "k", workspace: "w" } as never);
    expect(opts.defaultHeaders).toEqual(getTelemetryHeaders());
  });
});

describe("upgrading from 0.3.4", () => {
  let dir: string;
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = { ...process.env };
    for (const k of Object.keys(process.env)) if (k.startsWith("HONCHO_")) delete process.env[k];
    dir = mkdtempSync(join(tmpdir(), "honcho-cfg-"));
    process.env.HONCHO_CONFIG_PATH = join(dir, "config.json");
  });

  afterEach(() => {
    process.env = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  // 0.3.4 also read the block spelled `claude-code`; migration writes `claude_code` beside it.
  test.each(["claude_code", "claude-code"])("keeps logging: false in hosts[%p] as an off switch through the migration", async (key) => {
    const path = process.env.HONCHO_CONFIG_PATH!;
    writeFileSync(path, JSON.stringify({ apiKey: "k", peerName: "p", hosts: { [key]: { workspace: "w", logging: false } } }));

    expect(await migrateConfig("claude_code")).toContain("Moved your Honcho settings");
    const hosts = JSON.parse(readFileSync(path, "utf-8")).hosts;
    expect(hosts.claude_code).toMatchObject({ apiKey: "k", peerName: "p", workspace: "w" });
    expect(hosts[key].logging).toBe(false);
    expect(isLoggingEnabled("claude_code")).toBe(false);
  });

  test("HONCHO_LOGGING=false turns logging off over a config file that has it on", () => {
    writeFileSync(process.env.HONCHO_CONFIG_PATH!, JSON.stringify({ hosts: { claude_code: { apiKey: "k", schemaVersion: 2, logging: true } } }));
    expect(isLoggingEnabled("claude_code")).toBe(true);
    process.env.HONCHO_LOGGING = "false";
    expect(isLoggingEnabled("claude_code")).toBe(false);
  });

  test("HONCHO_ENDPOINT=local still points an env-only setup at a local Honcho", () => {
    process.env.HONCHO_API_KEY = "k";
    process.env.HONCHO_ENDPOINT = "local";
    expect(loadConfig("claude_code")?.baseUrl).toBe("http://localhost:8000");
  });

  test("HONCHO_ENDPOINT doesn't move a setup that has a key in its config file", () => {
    writeFileSync(process.env.HONCHO_CONFIG_PATH!, JSON.stringify({ hosts: { claude_code: { apiKey: "k", schemaVersion: 2 } } }));
    process.env.HONCHO_ENDPOINT = "local";
    expect(loadConfig("claude_code")?.baseUrl).toBe("https://api.honcho.dev");
  });
});
