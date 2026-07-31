import { describe, expect, test } from "bun:test";
import { coerceBoolean, detectHost, getDefaultWorkspace } from "../src/config";

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


describe("custom HONCHO_HOST", () => {
  test("HONCHO_HOST accepts custom host block name", () => {
    const oldHost = process.env.HONCHO_HOST;
    process.env.HONCHO_HOST = "claude_code_reviewer";
    // detectHost should return the custom value
    expect(detectHost()).toBe("claude_code_reviewer");
    process.env.HONCHO_HOST = oldHost ?? "";
    if (!oldHost) delete process.env.HONCHO_HOST;
  });

  test("custom host falls back to host name as default workspace", () => {
    const oldHost = process.env.HONCHO_HOST;
    process.env.HONCHO_HOST = "claude_code_reviewer";
    expect(getDefaultWorkspace()).toBe("claude_code_reviewer");
    process.env.HONCHO_HOST = oldHost ?? "";
    if (!oldHost) delete process.env.HONCHO_HOST;
  });

  test("known host still uses DEFAULT_WORKSPACE", () => {
    const oldHost = process.env.HONCHO_HOST;
    process.env.HONCHO_HOST = "obsidian";
    expect(getDefaultWorkspace()).toBe("obsidian");
    process.env.HONCHO_HOST = oldHost ?? "";
    if (!oldHost) delete process.env.HONCHO_HOST;
  });

  test("HONCHO_HOST with whitespace is trimmed", () => {
    const oldHost = process.env.HONCHO_HOST;
    process.env.HONCHO_HOST = "  claude_code  ";
    expect(detectHost()).toBe("claude_code");
    process.env.HONCHO_HOST = oldHost ?? "";
    if (!oldHost) delete process.env.HONCHO_HOST;
  });
});
