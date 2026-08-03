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

describe("worktree main-root resolution", () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("fs");
  const { join } = require("path");
  const { tmpdir } = require("os");
  const { resolveWorktreeMainRoot, worktreeMainRootFor } = require("../src/config");

  const makeTmp = () => mkdtempSync(join(tmpdir(), "honcho-wt-"));

  test("linked worktree resolves to the main repository root", () => {
    const tmp = makeTmp();
    try {
      const main = join(tmp, "main-repo");
      const wt = join(tmp, "worktrees", "feature-x");
      mkdirSync(join(main, ".git", "worktrees", "feature-x"), { recursive: true });
      mkdirSync(wt, { recursive: true });
      writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "feature-x")}\n`);
      expect(resolveWorktreeMainRoot(wt)).toBe(main);
      expect(worktreeMainRootFor(wt)).toBe(main);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("subdirectory of a worktree walks up to the pointer", () => {
    const tmp = makeTmp();
    try {
      const main = join(tmp, "main-repo");
      const wt = join(tmp, "wt");
      mkdirSync(join(wt, "src", "deep"), { recursive: true });
      writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);
      expect(worktreeMainRootFor(join(wt, "src", "deep"))).toBe(main);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("regular repository (.git directory) returns null", () => {
    const tmp = makeTmp();
    try {
      mkdirSync(join(tmp, ".git"), { recursive: true });
      expect(resolveWorktreeMainRoot(tmp)).toBeNull();
      expect(worktreeMainRootFor(tmp)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("no .git at all returns null", () => {
    const tmp = makeTmp();
    try {
      expect(resolveWorktreeMainRoot(tmp)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("gitdir pointer outside a worktrees dir (e.g. submodule) returns null", () => {
    const tmp = makeTmp();
    try {
      writeFileSync(join(tmp, ".git"), `gitdir: ${join(tmp, "elsewhere", "modules", "sub")}\n`);
      expect(resolveWorktreeMainRoot(tmp)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("relative gitdir pointer resolves against the worktree dir", () => {
    const tmp = makeTmp();
    try {
      const main = join(tmp, "main-repo");
      const wt = join(tmp, "wt");
      mkdirSync(wt, { recursive: true });
      writeFileSync(join(wt, ".git"), "gitdir: ../main-repo/.git/worktrees/wt\n");
      expect(resolveWorktreeMainRoot(wt)).toBe(main);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
