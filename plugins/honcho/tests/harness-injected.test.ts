import { describe, expect, test } from "bun:test";
import { isHarnessInjected } from "../src/hooks/user-prompt";

describe("isHarnessInjected", () => {
  test("treats a <channel> user-slot envelope as harness-injected", () => {
    const prompt =
      '<channel source="plugin:example" channel="a2a" user="peer">nonce</channel>';
    expect(isHarnessInjected(prompt)).toBe(true);
  });

  test("does not treat ordinary human text as harness-injected", () => {
    expect(isHarnessInjected("hello from the user")).toBe(false);
  });
});
