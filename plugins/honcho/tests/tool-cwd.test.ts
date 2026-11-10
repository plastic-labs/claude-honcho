import { describe, expect, test } from "bun:test";
import { resolveToolCwd } from "../src/cache";

// #136, #144: with two sessions open, an MCP tool call must resolve the calling
// session's directory, not whichever session wrote ~/.honcho/cache.json last.
describe("resolveToolCwd", () => {
  const otherSession = () => "/work/project-b";

  test("uses CLAUDE_PROJECT_DIR over the shared last-active entry", () => {
    expect(resolveToolCwd({ CLAUDE_PROJECT_DIR: "/work/project-a" }, "/work/project-a", otherSession)).toBe("/work/project-a");
  });

  test("uses the server's own working directory when CLAUDE_PROJECT_DIR is unset", () => {
    expect(resolveToolCwd({}, "/work/project-a", otherSession)).toBe("/work/project-a");
  });

  test("falls back to the last active session only from a plugin install folder", () => {
    expect(resolveToolCwd({}, "/home/u/.claude/plugins/cache/honcho/honcho/0.3.4", otherSession)).toBe("/work/project-b");
    expect(resolveToolCwd({}, "C:\\Users\\u\\.claude\\plugins\\cache\\honcho", otherSession)).toBe("/work/project-b");
  });

  test("keeps the server's working directory when nothing else is known", () => {
    expect(resolveToolCwd({}, "/home/u/.claude/plugins/cache/honcho", () => null)).toBe("/home/u/.claude/plugins/cache/honcho");
  });

  test("never reads the shared cache when the caller's directory is known", () => {
    let read = false;
    resolveToolCwd({ CLAUDE_PROJECT_DIR: "/work/project-a" }, "/x", () => { read = true; return "/work/project-b"; });
    expect(read).toBe(false);
  });
});
