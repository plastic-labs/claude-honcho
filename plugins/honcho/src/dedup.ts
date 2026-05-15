export function normalizeLine(line: string): string {
  return line
    .replace(/^\[.*?\]\s*/, "")
    .replace(/^- /, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function hashLine(normalized: string): string {
  return Bun.hash(normalized).toString(36);
}

export function pickFresh(
  lines: string[],
  alreadyHashed: Set<string>,
  limit: number,
): { fresh: string[]; freshHashes: string[]; droppedCount: number } {
  const fresh: string[] = [];
  const freshHashes: string[] = [];
  let droppedCount = 0;
  const seen = new Set(alreadyHashed);

  for (const line of lines) {
    const normalized = normalizeLine(line);
    const hash = hashLine(normalized);
    if (seen.has(hash)) {
      droppedCount = droppedCount + 1;
      continue;
    }
    fresh.push(line);
    freshHashes.push(hash);
    seen.add(hash);
    if (fresh.length >= limit) {
      break;
    }
  }

  return { fresh, freshHashes, droppedCount };
}
