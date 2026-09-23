import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getCurrentTurnAssistantMessages } from "../src/hooks/stop";

function transcript(lines: object[]): string {
  const path = join(mkdtempSync(join(tmpdir(), "stop-test-")), "t.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n"));
  return path;
}

const prompt = { type: "user", message: { content: "do the thing" } };
const wakeup = {
  type: "user",
  promptSource: "system",
  origin: { kind: "task-notification" },
  message: { content: "<task-notification>agent done</task-notification>" },
};
const toolResult = { type: "user", message: { content: [{ type: "tool_result", content: "file contents" }] } };
const msgA = { type: "assistant", timestamp: "t1", message: { content: [{ type: "text", text: "narration A" }] } };
const msgB = { type: "assistant", timestamp: "t2", message: { content: [{ type: "text", text: "narration B" }] } };

describe("getCurrentTurnAssistantMessages segment boundaries", () => {
  test("first firing collects the whole turn", () => {
    const path = transcript([prompt, msgA]);
    expect(getCurrentTurnAssistantMessages(path).map((b) => b.text)).toEqual(["narration A"]);
  });

  test("wakeup firing collects only blocks after the wakeup", () => {
    const path = transcript([prompt, msgA, wakeup, msgB]);
    expect(getCurrentTurnAssistantMessages(path).map((b) => b.text)).toEqual(["narration B"]);
  });

  test("multiple wakeups: only the latest segment", () => {
    const path = transcript([prompt, msgA, wakeup, msgB, wakeup, { ...msgA, message: { content: [{ type: "text", text: "final" }] } }]);
    expect(getCurrentTurnAssistantMessages(path).map((b) => b.text)).toEqual(["final"]);
  });

  test("origin.kind alone marks a boundary", () => {
    const bare = { type: "user", origin: { kind: "task-notification" }, message: { content: "<task-notification/>" } };
    const path = transcript([prompt, msgA, bare, msgB]);
    expect(getCurrentTurnAssistantMessages(path).map((b) => b.text)).toEqual(["narration B"]);
  });

  test("tool_result user entries do not end the segment", () => {
    const path = transcript([prompt, msgA, toolResult, msgB]);
    expect(getCurrentTurnAssistantMessages(path).map((b) => b.text)).toEqual(["narration A", "narration B"]);
  });

  test("prompt behind a leading system-reminder starts the segment", () => {
    const prefixed = { type: "user", message: { content: "<system-reminder>\nYou are operating in a git worktree.\n</system-reminder>\n\ndo the thing" } };
    const path = transcript([prefixed, msgA]);
    expect(getCurrentTurnAssistantMessages(path).map((b) => b.text)).toEqual(["narration A"]);
  });

  test("no prompt and no wakeup collects nothing", () => {
    const path = transcript([toolResult, msgA]);
    expect(getCurrentTurnAssistantMessages(path)).toEqual([]);
  });
});

// Captured from Claude Code 2.1.276: at Stop time the transcript ends at the prompt's
// bookkeeping entries and the assistant entry has not been flushed yet.
const capturedPrompt = {
  type: "user",
  promptSource: "typed",
  origin: { kind: "human" },
  message: { role: "user", content: "Reply with exactly one short sentence: what editor do I use?" },
  timestamp: "2026-09-21T15:30:32.889Z",
};
const capturedTail = [
  { type: "attachment", attachment: { type: "hook_additional_context" } },
  { type: "attachment", attachment: { type: "prompt_snapshot" } },
  { type: "last-prompt", lastPrompt: "Reply with exactly one short sentence: what editor do I use?" },
  { type: "mode", mode: "normal" },
  { type: "permission-mode", permissionMode: "default" },
  { type: "atis-latch", atis: "" },
  { type: "ai-title", aiTitle: "Editor recommendation" },
];
const capturedReply = { type: "assistant", timestamp: "t3", message: { role: "assistant", content: [{ type: "text", text: "You use Zed." }] } };

describe("getCurrentTurnAssistantMessages payload fallback", () => {
  test("unflushed final entry is filled from last_assistant_message", () => {
    const path = transcript([capturedPrompt, ...capturedTail]);
    expect(getCurrentTurnAssistantMessages(path, "You use Zed.").map((b) => b.text)).toEqual(["You use Zed."]);
  });

  test("flushed final entry is not duplicated", () => {
    const path = transcript([capturedPrompt, ...capturedTail, capturedReply]);
    expect(getCurrentTurnAssistantMessages(path, "You use Zed.")).toEqual([{ text: "You use Zed.", timestamp: "t3" }]);
  });

  test("intermediate blocks flushed, final one not", () => {
    const path = transcript([prompt, msgA, toolResult]);
    expect(getCurrentTurnAssistantMessages(path, "done").map((b) => b.text)).toEqual(["narration A", "done"]);
  });

  test("empty last_assistant_message changes nothing", () => {
    const path = transcript([prompt, msgA]);
    expect(getCurrentTurnAssistantMessages(path, "").map((b) => b.text)).toEqual(["narration A"]);
    expect(getCurrentTurnAssistantMessages(path, undefined).map((b) => b.text)).toEqual(["narration A"]);
  });
});
