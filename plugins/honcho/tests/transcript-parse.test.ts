import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseTranscriptForBackfill } from "../src/skills/transcript-parse";

function transcript(lines: object[]): string {
  const path = join(mkdtempSync(join(tmpdir(), "backfill-test-")), "t.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n"));
  return path;
}

describe("parseTranscriptForBackfill", () => {
  test("keeps a prompt behind a leading system-reminder, without the reminder", () => {
    const path = transcript([
      { type: "user", message: { content: "<system-reminder>\nYou are operating in a git worktree.\n</system-reminder>\n\ndo the thing" } },
      { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
    ]);
    const users = parseTranscriptForBackfill(path).messages.filter((m) => m.role === "user");
    expect(users.map((m) => m.content)).toEqual(["do the thing"]);
  });
});
