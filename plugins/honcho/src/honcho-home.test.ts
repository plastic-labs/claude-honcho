import { describe, expect, test, afterEach } from "bun:test";
import { homedir } from "os";
import { join, resolve } from "path";
import { getHonchoHome } from "./config.js";

// unit tests for the pure env-resolution helper. getHonchoHome() reads
// process.env.HONCHO_HOME on every call, so these run in-process.
describe("getHonchoHome", () => {
  const original = process.env.HONCHO_HOME;
  afterEach(() => {
    if (original === undefined) delete process.env.HONCHO_HOME;
    else process.env.HONCHO_HOME = original;
  });

  test("falls back to ~/.honcho when unset (backward compatible)", () => {
    delete process.env.HONCHO_HOME;
    expect(getHonchoHome()).toBe(join(homedir(), ".honcho"));
  });

  test("falls back to ~/.honcho when empty", () => {
    process.env.HONCHO_HOME = "";
    expect(getHonchoHome()).toBe(join(homedir(), ".honcho"));
  });

  test("falls back to ~/.honcho when whitespace-only", () => {
    process.env.HONCHO_HOME = "   ";
    expect(getHonchoHome()).toBe(join(homedir(), ".honcho"));
  });

  test("uses an absolute path verbatim", () => {
    process.env.HONCHO_HOME = "/tmp/honcho-state";
    expect(getHonchoHome()).toBe("/tmp/honcho-state");
  });

  test("expands a leading ~/ to the home directory", () => {
    process.env.HONCHO_HOME = "~/honcho-alt";
    expect(getHonchoHome()).toBe(join(homedir(), "honcho-alt"));
  });

  test("trims surrounding whitespace before use", () => {
    process.env.HONCHO_HOME = "  /tmp/honcho-trim  ";
    expect(getHonchoHome()).toBe("/tmp/honcho-trim");
  });

  test("resolves a relative path to an absolute path", () => {
    process.env.HONCHO_HOME = "relative/dir";
    expect(getHonchoHome()).toBe(resolve("relative/dir"));
  });

  test("expands a bare ~ to the home directory", () => {
    process.env.HONCHO_HOME = "~";
    expect(getHonchoHome()).toBe(homedir());
  });
});
