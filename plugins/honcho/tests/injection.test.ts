import { describe, expect, test } from "bun:test";
import { renderSessionStart } from "../src/injection";
import { visComposedInjection } from "../src/visual";

const components = ["directives", "summary", "peerCard"] as const;

describe("renderSessionStart notes", () => {
  test("names components that came back empty", () => {
    const rendered = renderSessionStart([...components], { summary: "", peerCard: [] });
    expect(rendered.labels).toEqual(["directives"]);
    expect(rendered.notes).toEqual(["summary none yet", "peer card empty"]);
    expect(visComposedInjection("session-start", rendered.labels, rendered.notes)).toBe(
      "[honcho] session-start ← injected directives · summary none yet · peer card empty",
    );
  });

  test("tells a failed fetch apart from an empty one", () => {
    const rendered = renderSessionStart([...components], { summary: null, peerCard: null });
    expect(rendered.notes).toEqual(["summary unavailable", "peer card unavailable"]);
  });

  test("has no notes when every component injects", () => {
    const rendered = renderSessionStart([...components], { summary: "did things", peerCard: ["a"] });
    expect(rendered.labels).toEqual(["directives", "summary", "peer card (1 items)"]);
    expect(rendered.notes).toEqual([]);
  });

  test("reports nothing injected when only empty components are selected", () => {
    const rendered = renderSessionStart(["summary"], { summary: "" });
    expect(rendered.content).toBe("");
    expect(visComposedInjection("session-start", rendered.labels, rendered.notes)).toBe(
      "[honcho] session-start ← nothing injected · summary none yet",
    );
  });
});
