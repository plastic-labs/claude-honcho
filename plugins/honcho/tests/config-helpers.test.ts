import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getHonchoClientOptions, getTelemetryHeaders, loadConfig, migrateConfig, uploadsDisabledBy } from "../src/config";

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

  test("keeps saveMessages: false as an off switch through the migration", async () => {
    const path = process.env.HONCHO_CONFIG_PATH!;
    writeFileSync(path, JSON.stringify({ apiKey: "k", peerName: "p", hosts: { claude_code: { workspace: "w", saveMessages: false } } }));

    expect(await migrateConfig("claude_code")).toContain("Moved your Honcho settings");
    const block = JSON.parse(readFileSync(path, "utf-8")).hosts.claude_code;
    expect(block).toMatchObject({ apiKey: "k", peerName: "p", workspace: "w", saveMessages: false });
    expect(uploadsDisabledBy("claude_code")).toBe("saveMessages: false in ~/.honcho/config.json");
  });

  test("HONCHO_ENDPOINT=local still points an env-only setup at a local Honcho", () => {
    process.env.HONCHO_API_KEY = "k";
    process.env.HONCHO_ENDPOINT = "local";
    expect(loadConfig("claude_code")?.baseUrl).toBe("http://localhost:8000");
  });
});
