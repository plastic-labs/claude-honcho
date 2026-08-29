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

  test("no prompt and no wakeup collects nothing", () => {
    const path = transcript([toolResult, msgA]);
    expect(getCurrentTurnAssistantMessages(path)).toEqual([]);
  });
});

describe("model attribution (ADR-0001)", () => {
  test("model from the transcript entry is carried on each block", () => {
    const withModel = { type: "assistant", timestamp: "t1", message: { model: "claude-fable-5", content: [{ type: "text", text: "hi" }] } };
    const path = transcript([prompt, withModel]);
    expect(getCurrentTurnAssistantMessages(path)).toEqual([{ text: "hi", timestamp: "t1", model: "claude-fable-5" }]);
  });

  test("entries without a model yield model undefined", () => {
    const path = transcript([prompt, msgA]);
    expect(getCurrentTurnAssistantMessages(path)[0]?.model).toBeUndefined();
  });

  test("mid-turn model switch keeps per-block attribution", () => {
    const a = { type: "assistant", timestamp: "t1", message: { model: "claude-opus-4-8", content: [{ type: "text", text: "a" }] } };
    const b = { type: "assistant", timestamp: "t2", message: { model: "claude-fable-5", content: [{ type: "text", text: "b" }] } };
    const path = transcript([prompt, a, b]);
    expect(getCurrentTurnAssistantMessages(path).map((x) => x.model)).toEqual(["claude-opus-4-8", "claude-fable-5"]);
  });
});
