import { describe, expect, test } from "bun:test";
import { normalizeSessionStart } from "../src/config";
import { honchoDirectives, renderSessionStart } from "../src/injection";
import { visComposedInjection } from "../src/visual";

const components = ["directives", "peerCard"] as const;

describe("renderSessionStart notes", () => {
  test("names components that came back empty", () => {
    const rendered = renderSessionStart([...components], { peerCard: [] });
    expect(rendered.labels).toEqual(["directives"]);
    expect(rendered.notes).toEqual(["peer card empty"]);
    expect(visComposedInjection("session-start", rendered.labels, rendered.notes)).toBe(
      "[honcho] session-start ← injected directives · peer card empty",
    );
  });

  test("tells a failed fetch apart from an empty one", () => {
    const rendered = renderSessionStart([...components], { peerCard: null });
    expect(rendered.notes).toEqual(["peer card unavailable"]);
  });

  test("has no notes when every component injects", () => {
    const rendered = renderSessionStart([...components], { peerCard: ["a"] });
    expect(rendered.labels).toEqual(["directives", "peer card (1 items)"]);
    expect(rendered.notes).toEqual([]);
  });

  test("reports nothing injected when only empty components are selected", () => {
    const rendered = renderSessionStart(["peerCard"], { peerCard: [] });
    expect(rendered.content).toBe("");
    expect(visComposedInjection("session-start", rendered.labels, rendered.notes)).toBe(
      "[honcho] session-start ← nothing injected · peer card empty",
    );
  });
});

describe("directives", () => {
  test("point recall at the chat tool and name this chat's scopes", () => {
    const text = honchoDirectives(false, ["claude-honcho", "laptop"]);
    expect(text).toContain("call `chat`");
    expect(text).toContain("`claude-honcho`, `laptop`");
    expect(text).toContain("`workspace: true`");
  });
});

describe("normalizeSessionStart", () => {
  test("drops removed components", () => {
    expect(normalizeSessionStart(["directives", "peerRepresentation", "summary", "briefing"])).toEqual(["directives", "peerCard"]);
  });
});
