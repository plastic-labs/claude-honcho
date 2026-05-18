import { describe, expect, test } from "bun:test";
import { homedir } from "os";
import { join } from "path";
import { resolveWorkspaceFromCwd, type WorkspaceRule } from "./config.js";

describe("resolveWorkspaceFromCwd", () => {
  test("returns null when no rules are provided", () => {
    expect(resolveWorkspaceFromCwd("/any/path", undefined)).toBeNull();
    expect(resolveWorkspaceFromCwd("/any/path", [])).toBeNull();
  });

  test("returns null when cwd matches no rule", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "/home/alice/work", workspace: "work" },
    ];
    expect(resolveWorkspaceFromCwd("/home/alice/personal", rules)).toBeNull();
  });

  test("matches exact prefix", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "/home/alice/work", workspace: "work" },
    ];
    expect(resolveWorkspaceFromCwd("/home/alice/work", rules)).toBe("work");
  });

  test("matches a subdirectory of the prefix", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "/home/alice/work", workspace: "work" },
    ];
    expect(
      resolveWorkspaceFromCwd("/home/alice/work/project-a", rules),
    ).toBe("work");
    expect(
      resolveWorkspaceFromCwd("/home/alice/work/project-a/src", rules),
    ).toBe("work");
  });

  test("does not match when prefix is only a substring", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "/home/alice/work", workspace: "work" },
    ];
    // /home/alice/work-old shares the prefix as a substring but is a sibling
    // directory — must not match.
    expect(
      resolveWorkspaceFromCwd("/home/alice/work-old", rules),
    ).toBeNull();
    expect(
      resolveWorkspaceFromCwd("/home/alice/workshop", rules),
    ).toBeNull();
  });

  test("first matching rule wins", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "/home/alice/work/secret", workspace: "secret" },
      { cwdPrefix: "/home/alice/work", workspace: "work" },
    ];
    expect(
      resolveWorkspaceFromCwd("/home/alice/work/secret/project", rules),
    ).toBe("secret");
    expect(
      resolveWorkspaceFromCwd("/home/alice/work/other/project", rules),
    ).toBe("work");
  });

  test("expands leading ~ to home directory", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "~/work", workspace: "work" },
    ];
    expect(
      resolveWorkspaceFromCwd(join(homedir(), "work", "project"), rules),
    ).toBe("work");
  });

  test("expands bare ~ as the home directory itself", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "~", workspace: "home-everything" },
    ];
    expect(resolveWorkspaceFromCwd(homedir(), rules)).toBe("home-everything");
    expect(
      resolveWorkspaceFromCwd(join(homedir(), "anything"), rules),
    ).toBe("home-everything");
  });

  test("normalises trailing slashes on both rule prefix and cwd", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "/home/alice/work/", workspace: "work" },
    ];
    expect(resolveWorkspaceFromCwd("/home/alice/work", rules)).toBe("work");
    expect(resolveWorkspaceFromCwd("/home/alice/work/", rules)).toBe("work");
    expect(
      resolveWorkspaceFromCwd("/home/alice/work/project/", rules),
    ).toBe("work");
  });

  test("matches Windows-style backslash cwd against forward-slash prefix", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "C:/Users/alice/work", workspace: "work" },
    ];
    expect(
      resolveWorkspaceFromCwd("C:\\Users\\alice\\work", rules),
    ).toBe("work");
    expect(
      resolveWorkspaceFromCwd("C:\\Users\\alice\\work\\project-a", rules),
    ).toBe("work");
  });

  test("matches Windows-style backslash cwd against backslash prefix", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "C:\\Users\\alice\\work", workspace: "work" },
    ];
    expect(
      resolveWorkspaceFromCwd("C:\\Users\\alice\\work", rules),
    ).toBe("work");
    expect(
      resolveWorkspaceFromCwd("C:\\Users\\alice\\work\\project-a", rules),
    ).toBe("work");
  });

  test("does not match Windows sibling directory", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "C:\\Users\\alice\\work", workspace: "work" },
    ];
    expect(
      resolveWorkspaceFromCwd("C:\\Users\\alice\\work-old", rules),
    ).toBeNull();
  });

  test("normalises trailing backslash on Windows cwd", () => {
    const rules: WorkspaceRule[] = [
      { cwdPrefix: "C:\\Users\\alice\\work", workspace: "work" },
    ];
    expect(
      resolveWorkspaceFromCwd("C:\\Users\\alice\\work\\", rules),
    ).toBe("work");
  });

  test("respects rule order when multiple rules could match", () => {
    const ruleA: WorkspaceRule[] = [
      { cwdPrefix: "/a", workspace: "first" },
      { cwdPrefix: "/a", workspace: "second" },
    ];
    expect(resolveWorkspaceFromCwd("/a", ruleA)).toBe("first");

    const ruleB: WorkspaceRule[] = [
      { cwdPrefix: "/a", workspace: "second" },
      { cwdPrefix: "/a", workspace: "first" },
    ];
    expect(resolveWorkspaceFromCwd("/a", ruleB)).toBe("second");
  });
});
