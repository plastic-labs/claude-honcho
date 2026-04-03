import { describe, test, expect } from "bun:test";
import { homedir } from "os";
import { matchSessionForPath } from "./config.js";

const HOME = homedir();

describe("matchSessionForPath", () => {
  test("exact match returns session name", () => {
    const sessions = { [`${HOME}/Code/my-project`]: "my-project" };
    expect(matchSessionForPath(`${HOME}/Code/my-project`, sessions)).toBe("my-project");
  });

  test("exact match with tilde key matches absolute cwd", () => {
    const sessions = { "~/Code/my-project": "my-project" };
    expect(matchSessionForPath(`${HOME}/Code/my-project`, sessions)).toBe("my-project");
  });

  test("glob * matches direct children only", () => {
    const sessions = { "~/Code/*": "code-catch-all" };
    expect(matchSessionForPath(`${HOME}/Code/foo`, sessions)).toBe("code-catch-all");
    expect(matchSessionForPath(`${HOME}/Code/bar`, sessions)).toBe("code-catch-all");
    expect(matchSessionForPath(`${HOME}/Code/foo/bar`, sessions)).toBeNull();
  });

  test("glob ** matches nested paths", () => {
    const sessions = { "~/Code/**": "code-deep" };
    expect(matchSessionForPath(`${HOME}/Code/foo`, sessions)).toBe("code-deep");
    expect(matchSessionForPath(`${HOME}/Code/foo/bar`, sessions)).toBe("code-deep");
    expect(matchSessionForPath(`${HOME}/Code/foo/bar/baz`, sessions)).toBe("code-deep");
  });

  test("exact match takes priority over glob", () => {
    const sessions = {
      "~/Code/*": "glob-session",
      [`${HOME}/Code/special`]: "exact-session",
    };
    expect(matchSessionForPath(`${HOME}/Code/special`, sessions)).toBe("exact-session");
    expect(matchSessionForPath(`${HOME}/Code/other`, sessions)).toBe("glob-session");
  });

  test("most specific glob wins (longest literal prefix)", () => {
    const sessions = {
      "~/Code/*": "broad",
      "~/Code/project-*": "specific",
    };
    expect(matchSessionForPath(`${HOME}/Code/project-foo`, sessions)).toBe("specific");
    expect(matchSessionForPath(`${HOME}/Code/other`, sessions)).toBe("broad");
  });

  test("trailing slash on cwd is normalized", () => {
    const sessions = { "~/Code/my-project": "my-project" };
    expect(matchSessionForPath(`${HOME}/Code/my-project/`, sessions)).toBe("my-project");
  });

  test("trailing slash on config key is normalized", () => {
    const sessions = { "~/Code/my-project/": "my-project" };
    expect(matchSessionForPath(`${HOME}/Code/my-project`, sessions)).toBe("my-project");
  });

  test("glob ** does not match the base directory itself", () => {
    const sessions = { "~/Code/**": "code-deep" };
    expect(matchSessionForPath(`${HOME}/Code`, sessions)).toBeNull();
  });

  test("resolve handles .. segments in config keys", () => {
    const sessions = { "~/Code/../Code/my-project": "my-project" };
    expect(matchSessionForPath(`${HOME}/Code/my-project`, sessions)).toBe("my-project");
  });

  test("resolve handles .. segments in cwd", () => {
    const sessions = { "~/Code/my-project": "my-project" };
    expect(matchSessionForPath(`${HOME}/Code/other/../my-project`, sessions)).toBe("my-project");
  });

  test("equal specificity globs break ties by pattern length", () => {
    // Both patterns have first metachar at the same index (after ~/Code/ab)
    const sessions = {
      "~/Code/ab*": "shorter",
      "~/Code/ab*-extra": "longer",
    };
    // "longer" pattern has greater total length, so it's checked first
    expect(matchSessionForPath(`${HOME}/Code/ab-test-extra`, sessions)).toBe("longer");
    // But a path that only matches the shorter pattern still works
    expect(matchSessionForPath(`${HOME}/Code/ab-test`, sessions)).toBe("shorter");
  });

  test("no match returns null", () => {
    const sessions = { "~/Code/*": "code-session" };
    expect(matchSessionForPath(`${HOME}/Other/project`, sessions)).toBeNull();
  });

  test("empty sessions returns null", () => {
    expect(matchSessionForPath(`${HOME}/Code/foo`, {})).toBeNull();
  });

  test("brace expansion matches multiple alternatives", () => {
    const sessions = { "~/Code/{frontend,backend}": "mono-session" };
    expect(matchSessionForPath(`${HOME}/Code/frontend`, sessions)).toBe("mono-session");
    expect(matchSessionForPath(`${HOME}/Code/backend`, sessions)).toBe("mono-session");
    expect(matchSessionForPath(`${HOME}/Code/infra`, sessions)).toBeNull();
  });

  test("? wildcard matches single character", () => {
    const sessions = { "~/Code/v?": "versioned" };
    expect(matchSessionForPath(`${HOME}/Code/v1`, sessions)).toBe("versioned");
    expect(matchSessionForPath(`${HOME}/Code/v2`, sessions)).toBe("versioned");
    expect(matchSessionForPath(`${HOME}/Code/v10`, sessions)).toBeNull();
  });

  test("[...] character class matches specified characters", () => {
    const sessions = { "~/Code/[abc]-project": "abc-session" };
    expect(matchSessionForPath(`${HOME}/Code/a-project`, sessions)).toBe("abc-session");
    expect(matchSessionForPath(`${HOME}/Code/b-project`, sessions)).toBe("abc-session");
    expect(matchSessionForPath(`${HOME}/Code/z-project`, sessions)).toBeNull();
  });

  test("** vs * specificity: ** wins tie-break by length for direct children", () => {
    const sessions = {
      "~/Code/*": "shallow",
      "~/Code/**": "deep",
    };
    // Both match, ** is longer so it sorts first and wins
    expect(matchSessionForPath(`${HOME}/Code/foo`, sessions)).toBe("deep");
    // Only ** matches nested
    expect(matchSessionForPath(`${HOME}/Code/foo/bar`, sessions)).toBe("deep");
  });

  test("longer non-matching glob falls through to shorter matching glob", () => {
    const sessions = {
      "~/Code/ab*": "catch-all",
      "~/Code/ab*/deep/**": "deep-only",
    };
    // deep-only sorts first (longer) but doesn't match — falls through to catch-all
    expect(matchSessionForPath(`${HOME}/Code/abcdef`, sessions)).toBe("catch-all");
  });

  test("relative paths are ignored", () => {
    // config is global — relative keys are always a mistake
    const sessions = { "**/my-project": "anywhere", "Code/foo": "bar" };
    expect(matchSessionForPath(`${HOME}/Code/my-project`, sessions)).toBeNull();
    expect(matchSessionForPath(`${HOME}/Code/foo`, sessions)).toBeNull();
  });

  test("empty, relative, and ~prefixed-non-home keys are ignored", () => {
    const sessions = { "": "oops", "relative/path": "nope", "~worktree": "nope", "~/Code/foo": "real" };
    expect(matchSessionForPath(`${HOME}/Code/foo`, sessions)).toBe("real");
    expect(matchSessionForPath(process.cwd(), sessions)).toBeNull();
  });

  test("empty string session value is ignored", () => {
    const sessions = { "~/Code/foo": "" };
    // Empty values are skipped to avoid falsy-value bugs in consumers
    expect(matchSessionForPath(`${HOME}/Code/foo`, sessions)).toBeNull();
  });

  test("worktree glob pattern matches worktree directories", () => {
    const sessions = {
      "~/Code/project": "my-project",
      "~/Code/project.worktrees/*": "my-project",
    };
    expect(matchSessionForPath(`${HOME}/Code/project`, sessions)).toBe("my-project");
    expect(matchSessionForPath(`${HOME}/Code/project.worktrees/branch-1`, sessions)).toBe("my-project");
    expect(matchSessionForPath(`${HOME}/Code/project.worktrees/branch-2`, sessions)).toBe("my-project");
  });
});
