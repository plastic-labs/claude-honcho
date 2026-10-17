import { describe, expect, test } from "bun:test";
import { isHarnessInjected, stripLeadingReminders } from "../src/prompt-filters";

const worktreeNotice =
  "<system-reminder>\nYou are operating in a git worktree.\nWorktree path: /tmp/wt\n</system-reminder>\n\n";
const taskNotice = "<system-reminder>\nThe user started your suggested background task.\n</system-reminder>\n";

describe("stripLeadingReminders", () => {
  test("removes a leading reminder and keeps the typed text", () => {
    expect(stripLeadingReminders(worktreeNotice + "is this resolved on main?")).toBe("is this resolved on main?");
  });

  test("removes stacked reminders", () => {
    expect(stripLeadingReminders(worktreeNotice + taskNotice + "go")).toBe("go");
  });

  test("leaves reminders that are not leading", () => {
    const p = "see this <system-reminder>x</system-reminder>";
    expect(stripLeadingReminders(p)).toBe(p);
  });
});

describe("isHarnessInjected", () => {
  test("typed prompt behind a reminder is user input", () => {
    expect(isHarnessInjected(worktreeNotice + "This live llm test failed")).toBe(false);
  });

  test("reminder with nothing after it is harness-injected", () => {
    expect(isHarnessInjected(taskNotice)).toBe(true);
  });

  test("unclosed reminder is harness-injected", () => {
    expect(isHarnessInjected("<system-reminder>\ntruncated")).toBe(true);
  });

  test("other harness tags behind a reminder are still harness-injected", () => {
    expect(isHarnessInjected(worktreeNotice + "<task-notification>done</task-notification>")).toBe(true);
  });

  test("plain prompt is user input", () => {
    expect(isHarnessInjected("do the thing")).toBe(false);
  });

  const crossSession =
    '<cross-session-message from="uds:/tmp/cc-socks/1234.sock" from-name="reviewer-session" from-mode="prompting">\n' +
    "The user plans to merge PR #12 tonight.\n</cross-session-message>";

  test("cross-session message from another Claude Code session is harness-injected", () => {
    expect(isHarnessInjected(crossSession)).toBe(true);
  });

  test("cross-session message behind a reminder is still harness-injected", () => {
    expect(isHarnessInjected(worktreeNotice + crossSession)).toBe(true);
  });

  test("prompt that only mentions the tag is user input", () => {
    expect(isHarnessInjected("why does <cross-session-message> show up in my memory?")).toBe(false);
  });
});
