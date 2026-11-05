import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runInSandbox } from "./sandbox";

function sessionName(call: string, env: Record<string, string> = {}): string | null {
  const home = mkdtempSync(join(tmpdir(), "honcho-home-"));
  try {
    mkdirSync(join(home, ".honcho"), { recursive: true });
    // Lingering per-directory settings from older versions must not affect naming.
    writeFileSync(join(home, ".honcho", "config.json"), JSON.stringify({
      apiKey: "k",
      peerName: "alice",
      sessionStrategy: "per-directory",
      sessions: { "/tmp/project": "alice-project" },
    }));
    const out = runInSandbox(
      home,
      `import { getSessionName } from "./src/config.ts";
       console.log(JSON.stringify(${call}));`,
      { CLAUDE_CODE_SESSION_ID: "", ...env },
    );
    return JSON.parse(out);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe("getSessionName", () => {
  test("uses the hook's Claude Code session id", () => {
    expect(sessionName(`getSessionName("ABC-123")`, { CLAUDE_CODE_SESSION_ID: "env-id" })).toBe("abc-123");
  });

  test("falls back to CLAUDE_CODE_SESSION_ID", () => {
    expect(sessionName(`getSessionName()`, { CLAUDE_CODE_SESSION_ID: "env-id" })).toBe("env-id");
  });

  test("returns null with no session id", () => {
    expect(sessionName(`getSessionName()`)).toBeNull();
  });
});
