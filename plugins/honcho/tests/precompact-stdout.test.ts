import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// PreCompact's stdout is compaction input, and the stdout formatters carry no
// logging gate, so the invariant is that this hook never reaches for them. The
// runtime path needs a live Honcho client, so these assert against source text
// instead — a rename or a reformat of the console.log will fail them with
// nothing actually wrong. Read a failure as "check what moved" first.
const preCompactSource = readFileSync(join(import.meta.dir, "..", "src", "hooks", "pre-compact.ts"), "utf-8");

describe("pre-compact stdout stays free of verbose dumps", () => {
  test("does not call the stdout verbose formatters", () => {
    expect(preCompactSource).not.toMatch(/formatVerbose(Block|List)\s*\(/);
  });

  test("routes verbose data to the log file instead", () => {
    expect(preCompactSource).toMatch(/verboseApiResult\s*\(/);
    expect(preCompactSource).toMatch(/verboseList\s*\(/);
  });

  test("prints the memory card and nothing appended after it", () => {
    const logged = preCompactSource.match(/console\.log\((.*)\);/g) ?? [];
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("${memoryCard}`)");
  });
});
