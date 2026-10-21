import { describe, expect, test } from "bun:test";
import { addSystemMessage } from "../src/visual";

describe("addSystemMessage", () => {
  const output = { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "ctx" } };

  test("attaches the inline message by default", () => {
    expect(addSystemMessage(output, "[honcho] injected", false)).toEqual({ ...output, systemMessage: "[honcho] injected" });
  });

  test("quiet leaves the hook output untouched, so context still injects", () => {
    expect(addSystemMessage(output, "[honcho] injected", true)).toEqual(output);
  });
});
