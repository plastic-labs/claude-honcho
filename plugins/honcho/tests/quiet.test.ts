import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { addSystemMessage } from "../src/visual";
import { runInSandbox } from "./sandbox";

describe("addSystemMessage", () => {
  const output = { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "ctx" } };

  test("attaches the inline message by default", () => {
    expect(addSystemMessage(output, "[honcho] injected", false)).toEqual({ ...output, systemMessage: "[honcho] injected" });
  });

  test("quiet leaves the hook output untouched, so context still injects", () => {
    expect(addSystemMessage(output, "[honcho] injected", true)).toEqual(output);
  });
});

// Caller-level coverage: run the real SessionStart hook with the SDK stubbed
// out, so the quiet flag is resolved from config the way the hook resolves it.
function runSessionStart(fileConfig: Record<string, unknown>): any {
  const home = mkdtempSync(join(tmpdir(), "honcho-home-"));
  try {
    mkdirSync(join(home, ".honcho"), { recursive: true });
    writeFileSync(join(home, ".honcho", "config.json"), JSON.stringify({
      apiKey: "k",
      peerName: "t",
      injection: { sessionStart: ["directives"] },
      ...fileConfig,
    }));
    const out = runInSandbox(
      home,
      `import { mock } from "bun:test";
       const peer = { id: "p" };
       const session = { id: "s", addPeers: async () => {}, addMessages: async () => {}, summaries: async () => null };
       mock.module("@honcho-ai/sdk", () => ({
         Honcho: class { async session() { return session; } async peer() { return peer; } },
       }));
       const { handleSessionStart } = await import("./src/hooks/session-start.ts");
       await handleSessionStart();`,
    );
    // The hook prints one JSON line on stdout; ignore anything else.
    const line = out.split("\n").reverse().find((l) => l.startsWith("{"));
    return JSON.parse(line!);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe("SessionStart hook output", () => {
  test("injects context and shows the inline message by default", () => {
    const out = runSessionStart({});
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toContain("[Honcho Memory for t]:");
    expect(out.systemMessage).toBe("[honcho] session-start ← injected directives");
  });

  test("quiet still injects context but drops the inline message", () => {
    const out = runSessionStart({ quiet: true });
    expect(out.hookSpecificOutput.additionalContext).toContain("[Honcho Memory for t]:");
    expect(out).not.toHaveProperty("systemMessage");
  });
});
