import { describe, expect, test } from "bun:test";
import { isHarnessInjected, isSlashCommand, stripLeadingReminders } from "../src/prompt-filters";

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
});

describe("isSlashCommand", () => {
  test("matches either tag order", () => {
    expect(isSlashCommand("<command-message>honcho:status</command-message>\n<command-name>/honcho:status</command-name>")).toBe(true);
    expect(isSlashCommand("<command-name>/model</command-name>\n<command-message>model</command-message>")).toBe(true);
  });

  test("matches behind a leading reminder", () => {
    expect(isSlashCommand(worktreeNotice + "<command-name>/honcho</command-name>")).toBe(true);
  });

  test("does not match command output or typed text", () => {
    expect(isSlashCommand("<local-command-stdout>ok</local-command-stdout>")).toBe(false);
    expect(isSlashCommand("what does <command-name> mean?")).toBe(false);
  });
});
