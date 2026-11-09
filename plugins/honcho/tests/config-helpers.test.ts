import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getHonchoClientOptions, getTelemetryHeaders } from "../src/config";

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
