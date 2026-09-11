import { describe, expect, test } from "bun:test";
import { isHarnessInjected } from "../src/hooks/user-prompt";

// A real envelope in the shape the UserPromptSubmit hook receives it: the `prompt`
// field is the bare tag. The "Another Claude session sent a message:" prefix and the
// `isMeta: true` flag live on the transcript entry and never reach the hook, so the
// pattern can anchor at the start of the string.
const ENVELOPE = String.raw`<cross-session-message from="uds:\\.\pipe\LOCAL\cc-msg-3fd3f6b8db72641a03b3907e985618d1" from-name="reviewer-session" from-mode="prompting">
Take a look at the failing test in auth.spec.ts before you push.
</cross-session-message>`;

describe("isHarnessInjected", () => {
  test("treats a <cross-session-message> envelope as harness-injected", () => {
    expect(isHarnessInjected(ENVELOPE)).toBe(true);
  });

  test("matches when the turn arrives padded with whitespace", () => {
    expect(isHarnessInjected(`\n  ${ENVELOPE}\n`)).toBe(true);
  });

  test("does not match a prompt that only mentions the tag", () => {
    expect(
      isHarnessInjected("why does <cross-session-message> show up in my memory store?"),
    ).toBe(false);
  });

  test("does not treat ordinary human text as harness-injected", () => {
    expect(isHarnessInjected("check whether the disk is still at 90%")).toBe(false);
  });
});
