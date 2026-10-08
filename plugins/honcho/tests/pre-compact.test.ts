import { describe, expect, test } from "bun:test";
import { stripChatFiller } from "../src/hooks/pre-compact";

describe("stripChatFiller", () => {
  test("drops trailing offers", () => {
    const answer = "- Prefers pnpm.\n- Works on claude-honcho.\n\nIf you'd like, I can convert this into a short reference card.";
    expect(stripChatFiller(answer)).toBe("- Prefers pnpm.\n- Works on claude-honcho.");
    expect(stripChatFiller("- a\n\nIf you want, I can expand.\n\nLet me know!")).toBe("- a");
  });

  test("keeps facts, including an answer that is only one paragraph", () => {
    expect(stripChatFiller("- a\n\n- b")).toBe("- a\n\n- b");
    expect(stripChatFiller("If you want details, they live in DEV-2024.")).toBe("If you want details, they live in DEV-2024.");
  });
});
