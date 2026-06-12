import { describe, expect, test } from "bun:test";
import { extractTopics, formatCachedContext, stripConclusionLine } from "./user-prompt";

function conclusions(parts: string[]): string[] {
  const block = parts.find((p) => p.startsWith("Relevant conclusions: "));
  if (!block) return [];
  return block.replace("Relevant conclusions: ", "").split("; ");
}

describe("stripConclusionLine", () => {
  test("strips leading [timestamp] prefix", () => {
    expect(stripConclusionLine("[2026-06-10 16:38:50] user likes coffee")).toBe("user likes coffee");
  });

  test("strips leading bullet", () => {
    expect(stripConclusionLine("- user likes coffee")).toBe("user likes coffee");
  });

  test("trims whitespace and leaves plain lines untouched", () => {
    expect(stripConclusionLine("  user likes coffee  ")).toBe("user likes coffee");
  });
});

describe("extractTopics", () => {
  test("extracts technical terms", () => {
    expect(extractTopics("how do I configure kubernetes and redis?")).toEqual(["kubernetes", "redis"]);
  });

  test("extracts file paths", () => {
    expect(extractTopics("look at src/hooks/user-prompt.ts please")).toContain("src/hooks/user-prompt.ts");
  });

  test("extracts quoted strings", () => {
    expect(extractTopics('what about the "billing service"?')).toContain("billing service");
  });

  test("returns empty for prompts with no high-signal topics (callers fall back to the raw prompt)", () => {
    // Regression: the old stopword fallback was English-only and turned
    // non-English prompts into low-signal word salad.
    expect(extractTopics("come siamo messi ora con il lavoro?")).toEqual([]);
    expect(extractTopics("what should we do next?")).toEqual([]);
  });
});

describe("formatCachedContext", () => {
  const rep = [
    "# Header is filtered",
    "[2026-01-01 10:00:00] oldest fact",
    "[2026-03-01 10:00:00] middle fact",
    "[2026-06-01 10:00:00] newest fact",
  ].join("\n");

  test("puts search-matched conclusions first", () => {
    const ctx = { representation: rep, searchMatched: ["matched one", "matched two"] };
    const { parts } = formatCachedContext(ctx, "peer");
    expect(conclusions(parts).slice(0, 2)).toEqual(["matched one", "matched two"]);
  });

  test("fills remaining slots with newest representation lines, not oldest", () => {
    // Regression for the core bug: the representation is ordered
    // oldest-first and the hook used to inject its head.
    const ctx = { representation: rep };
    const { parts } = formatCachedContext(ctx, "peer");
    expect(conclusions(parts)).toEqual(["newest fact", "middle fact", "oldest fact"]);
  });

  test("dedupes search matches against representation lines (normalized)", () => {
    const ctx = { representation: rep, searchMatched: ["Newest FACT"] };
    const { parts, conclusionCount } = formatCachedContext(ctx, "peer");
    expect(conclusions(parts)).toEqual(["Newest FACT", "middle fact", "oldest fact"]);
    expect(conclusionCount).toBe(3);
  });

  test("caps the selection at 5", () => {
    const many = Array.from({ length: 8 }, (_, i) => `[2026-01-0${i + 1} 10:00:00] fact ${i + 1}`).join("\n");
    const ctx = { representation: many, searchMatched: ["m1", "m2"] };
    const { parts, conclusionCount } = formatCachedContext(ctx, "peer");
    expect(conclusionCount).toBe(5);
    expect(conclusions(parts)).toEqual(["m1", "m2", "fact 8", "fact 7", "fact 6"]);
  });

  test("preserves original order for lines without timestamps", () => {
    const ctx = { representation: "first line\nsecond line\nthird line" };
    const { parts } = formatCachedContext(ctx, "peer");
    expect(conclusions(parts)).toEqual(["first line", "second line", "third line"]);
  });

  test("works with search matches only (no representation)", () => {
    const ctx = { searchMatched: ["only match"] };
    const { parts } = formatCachedContext(ctx, "peer");
    expect(conclusions(parts)).toEqual(["only match"]);
  });

  test("returns no conclusion part when there is nothing to inject", () => {
    const { parts, conclusionCount } = formatCachedContext({ representation: "" }, "peer");
    expect(parts.filter((p) => p.startsWith("Relevant conclusions"))).toHaveLength(0);
    expect(conclusionCount).toBe(0);
  });

  test("appends peer card as Profile", () => {
    const ctx = { representation: rep, peerCard: ["name: avigano", "role: advisor"] };
    const { parts } = formatCachedContext(ctx, "peer");
    expect(parts.at(-1)).toBe("Profile: name: avigano; role: advisor");
  });

  test("survives a JSON cache round-trip (searchMatched is a plain property)", () => {
    const ctx = JSON.parse(JSON.stringify({ representation: rep, searchMatched: ["matched one"] }));
    const { parts } = formatCachedContext(ctx, "peer");
    expect(conclusions(parts)[0]).toBe("matched one");
  });
});
