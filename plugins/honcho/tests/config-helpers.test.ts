import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { coerceBoolean, getHonchoClientOptions, getTelemetryHeaders } from "../src/config";

describe("coerceBoolean", () => {
  test("passes real booleans through", () => {
    expect(coerceBoolean(true)).toBe(true);
    expect(coerceBoolean(false)).toBe(false);
  });

  test('string "false" is false (MCP args arrive as strings)', () => {
    expect(coerceBoolean("false")).toBe(false);
    expect(coerceBoolean("FALSE")).toBe(false);
    expect(coerceBoolean(" false ")).toBe(false);
    expect(coerceBoolean("0")).toBe(false);
    expect(coerceBoolean("")).toBe(false);
  });

  test('string "true" and other truthy strings are true', () => {
    expect(coerceBoolean("true")).toBe(true);
    expect(coerceBoolean("1")).toBe(true);
  });

  test("non-string non-boolean values coerce naturally", () => {
    expect(coerceBoolean(1)).toBe(true);
    expect(coerceBoolean(0)).toBe(false);
    expect(coerceBoolean(undefined)).toBe(false);
    expect(coerceBoolean(null)).toBe(false);
  });
});

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
