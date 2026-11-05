import { describe, expect, test } from "bun:test";
import { renderSessionStart } from "../src/injection";
import { visComposedInjection } from "../src/visual";

const components = ["directives", "peerCard", "peerRepresentation"] as const;

describe("renderSessionStart notes", () => {
  test("names components that came back empty", () => {
    const rendered = renderSessionStart([...components], { peerCard: [], representation: "" });
    expect(rendered.labels).toEqual(["directives"]);
    expect(rendered.notes).toEqual(["peer card empty", "representation empty"]);
    expect(visComposedInjection("session-start", rendered.labels, rendered.notes)).toBe(
      "[honcho] session-start ← injected directives · peer card empty · representation empty",
    );
  });

  test("tells a failed fetch apart from an empty one", () => {
    const rendered = renderSessionStart([...components], { peerCard: null, representation: null });
    expect(rendered.notes).toEqual(["peer card unavailable", "representation unavailable"]);
  });

  test("has no notes when every component injects", () => {
    const rendered = renderSessionStart([...components], { peerCard: ["a"], representation: "rep" });
    expect(rendered.labels).toEqual(["directives", "peer card (1 items)", "representation"]);
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
