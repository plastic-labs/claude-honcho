import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// PreCompact's stdout is the compaction input, so everything printed there is
// charged to context on every request until the next compaction. The memory
// card has to be there; verbose API dumps must not, and they duplicate the card
// almost exactly when they are. The stdout formatters have no logging gate, so
// the guard is that this hook never reaches for them in the first place.
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
