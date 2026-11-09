import { describe, expect, test } from "bun:test";
import { honchoDirectives, renderSessionStart } from "../src/injection";
import { visComposedInjection } from "../src/visual";

describe("renderSessionStart notes", () => {
  test("names an empty peer card", () => {
    const rendered = renderSessionStart({ peerCard: [] });
    expect(rendered.labels).toEqual(["directives"]);
    expect(rendered.notes).toEqual(["peer card empty"]);
    expect(visComposedInjection("session-start", rendered.labels, rendered.notes)).toBe(
      "[honcho] session-start ← injected directives · peer card empty",
    );
  });

  test("tells a failed fetch apart from an empty one", () => {
    const rendered = renderSessionStart({ peerCard: null });
    expect(rendered.notes).toEqual(["peer card unavailable"]);
  });

  test("has no notes when the card is there", () => {
    const rendered = renderSessionStart({ peerCard: ["a"] });
    expect(rendered.labels).toEqual(["directives", "peer card (1 items)"]);
    expect(rendered.notes).toEqual([]);
  });
});

describe("directives", () => {
  test("point recall at the chat tool and name this chat's scopes", () => {
    const text = honchoDirectives(["claude-honcho", "laptop"]);
    expect(text).toContain("call `chat`");
    expect(text).toContain("`claude-honcho`, `laptop`");
    expect(text).toContain("`workspace: true`");
  });
});
