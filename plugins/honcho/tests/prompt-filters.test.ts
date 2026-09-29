import { describe, expect, test } from "bun:test";
import {
  isExcludedUserPrompt,
  isHarnessInjected,
  matchesSkipUserPattern,
  stripLeadingReminders,
  stripPastedContentWrapper,
} from "../src/prompt-filters";

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

describe("stripPastedContentWrapper", () => {
  test("removes a leading wrapper and its closing tag", () => {
    expect(stripPastedContentWrapper('<pasted_content id="1" lines="2">\n[relay] status\n</pasted_content>')).toBe("[relay] status");
  });

  test("leaves a prompt without a leading wrapper untouched", () => {
    const p = "see <pasted_content>x</pasted_content>";
    expect(stripPastedContentWrapper(p)).toBe(p);
  });
});

describe("skipUserPatterns", () => {
  const patterns = ["^\\[relay\\]", "^From sub-agent:"];

  test("matching prompt is excluded from upload and retrieval", () => {
    expect(isExcludedUserPrompt("[relay] build finished on the worker", patterns)).toBe(true);
    expect(isExcludedUserPrompt(worktreeNotice + "From sub-agent: done", patterns)).toBe(true);
  });

  test("non-matching prompt is not excluded", () => {
    expect(isExcludedUserPrompt("please review the relay module", patterns)).toBe(false);
  });

  test("matches the text inside a leading pasted_content wrapper", () => {
    const pasted = '<pasted_content lines="3">\n[relay] build finished\n</pasted_content>';
    expect(matchesSkipUserPattern(pasted, patterns)).toBe(true);
    expect(isExcludedUserPrompt(pasted, patterns)).toBe(true);
  });

  test("invalid regex is ignored with a warning, valid ones still apply", () => {
    const warnings: string[] = [];
    const warn = (m: string) => warnings.push(m);
    expect(isExcludedUserPrompt("[relay] ok", ["(unclosed", ...patterns], warn)).toBe(true);
    expect(isExcludedUserPrompt("plain prompt", ["(unclosed"], warn)).toBe(false);
    expect(warnings.length).toBe(2);
    expect(warnings[0]).toContain("(unclosed");
  });

  test("no patterns configured keeps the built-in harness filter only", () => {
    expect(isExcludedUserPrompt("[relay] hi", undefined)).toBe(false);
    expect(isExcludedUserPrompt("[relay] hi", [])).toBe(false);
    expect(isExcludedUserPrompt(taskNotice, [])).toBe(true);
  });
});
