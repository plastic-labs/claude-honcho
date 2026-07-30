import { describe, expect, test } from "bun:test";
import { coerceBoolean } from "../src/config";

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
