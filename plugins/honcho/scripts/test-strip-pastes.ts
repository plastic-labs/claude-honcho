#!/usr/bin/env bun
/**
 * Standalone unit test for the stripPastes() heuristic in
 * src/hooks/user-prompt.ts. Run with:
 *
 *   bun run scripts/test-strip-pastes.ts
 *
 * No test framework required. Exits 0 on pass, 1 on fail.
 *
 * The repo currently has no test runner; this file is a pragmatic
 * regression check intended to be rerun manually before releases that
 * touch user-prompt.ts. Mirrors the heuristic exactly — if the source
 * changes, this file should be updated in the same PR.
 */

function stripPastes(prompt: string): { prompt: string; redacted: boolean } {
  if (!prompt) return { prompt, redacted: false };

  let redacted = false;
  let out = prompt;

  const fenced = stripFencedBlocks(out);
  if (fenced.redacted) {
    redacted = true;
    out = fenced.prompt;
  }

  const diffed = stripUnifiedDiffBlocks(out);
  if (diffed.redacted) {
    redacted = true;
    out = diffed.prompt;
  }

  out = out
    .split("\n")
    .map((line) => {
      if (looksLikeLongPathOutput(line)) {
        redacted = true;
        return "[path/output removed]";
      }
      return line;
    })
    .join("\n");

  return { prompt: out, redacted };
}

function stripFencedBlocks(input: string): { prompt: string; redacted: boolean } {
  const lines = input.split("\n");
  const out: string[] = [];
  const openRe = /^(\s*)([`~]{3,})/;
  let i = 0;
  let redacted = false;
  while (i < lines.length) {
    const m = openRe.exec(lines[i]);
    if (!m) { out.push(lines[i]); i++; continue; }
    const opener = m[2];
    const fenceChar = opener[0];
    const minLen = opener.length;
    redacted = true;
    out.push("[code block removed]");
    i++;
    while (i < lines.length) {
      const cm = /^\s*([`~]{3,})\s*$/.exec(lines[i]);
      if (cm && cm[1][0] === fenceChar && cm[1].length >= minLen) { i++; break; }
      i++;
    }
  }
  return { prompt: out.join("\n"), redacted };
}

function stripUnifiedDiffBlocks(input: string): { prompt: string; redacted: boolean } {
  const anchorRe = /^(?:@@|---\s+a\/|\+\+\+\s+b\/)/;
  const diffBodyRe = /^(?:@@|---\s|\+\+\+\s|[+\-]| )/;
  const lines = input.split("\n");
  const out: string[] = [];
  let i = 0;
  let redacted = false;
  while (i < lines.length) {
    if (!anchorRe.test(lines[i])) { out.push(lines[i]); i++; continue; }
    redacted = true;
    out.push("[diff removed]");
    while (i < lines.length && diffBodyRe.test(lines[i])) i++;
    while (i < lines.length && lines[i].trim() === "") i++;
  }
  return { prompt: out.join("\n"), redacted };
}

function looksLikeLongPathOutput(line: string): boolean {
  if (line.length <= 200) return false;
  if (!/\s/.test(line)) return /\//.test(line);
  return /(?:\/[A-Za-z0-9._\-]+){3,}/.test(line);
}

interface Case {
  name: string;
  input: string;
  expectRedacted: boolean;
  mustContain?: string[];
  mustNotContain?: string[];
}

const cases: Case[] = [
  {
    name: "pure prose — must NOT redact",
    input: "I'd like to refactor the auth middleware. Please review the trade-offs.",
    expectRedacted: false,
  },
  {
    name: "fenced code block — must redact + strip code",
    input: "Review this:\n```ts\nconst x = 1;\nconst y = 2;\n```\nThanks.",
    expectRedacted: true,
    mustContain: ["[code block removed]"],
    mustNotContain: ["const x"],
  },
  {
    name: "unclosed fence (fail-closed) — must redact and not leak content",
    input: "Review:\n```ts\nconst secret = buildOperatorPlan();\n",
    expectRedacted: true,
    mustContain: ["[code block removed]"],
    mustNotContain: ["const secret", "buildOperatorPlan"],
  },
  {
    name: "four-backtick fence with inner triple-backtick — must redact whole block",
    input: "Outer:\n````md\nSee:\n```ts\nleak();\n```\nMore.\n````\nDone.",
    expectRedacted: true,
    mustContain: ["[code block removed]", "Done."],
    mustNotContain: ["leak()"],
  },
  {
    name: "tilde-fence — must redact",
    input: "Look:\n~~~\nleaked stuff\n~~~\nThanks.",
    expectRedacted: true,
    mustContain: ["[code block removed]"],
    mustNotContain: ["leaked stuff"],
  },
  {
    name: "+/- lines without diff anchor (ambiguous, treated as prose) — must NOT redact",
    input: "Review this diff:\n+const a = 1;\n-const b = 2;\n+const c = 3;\nThanks.",
    expectRedacted: false,
    mustNotContain: ["[diff removed]"],
  },
  {
    name: "long path-bearing line that looks like a stack trace — must redact",
    input: "Look:\n/Users/foo/" + "a/".repeat(110) + "file.ts:123\nFix it.",
    expectRedacted: true,
    mustContain: ["[path/output removed]"],
  },
  {
    name: "long PROSE paragraph with URL/fraction — must NOT redact (silent-loss guard)",
    input:
      "I think the auth middleware should fail closed by default and we should also tighten rate limiting because the current 1/2 per second budget is too generous; we should look at https://example.com/docs for prior art and run the experiment with logging enabled. Want to discuss?",
    expectRedacted: false,
    mustNotContain: ["[path/output removed]"],
  },
  {
    name: "short path-bearing line — must NOT redact",
    input: "Edit /Users/foo/file.ts please",
    expectRedacted: false,
  },
  {
    name: "adversarial-review pattern (the original bug) — must redact code, preserve prose",
    input: `You are performing an adversarial code review. Review the provided git diff:

\`\`\`diff
+function buildOperatorPlan(field) {
+  if (field.provenanceStatus === 'UNKNOWN_REQUIRE_USER') {
+    return { pauseReason: 'UNKNOWN_REQUIRE_USER' };
+  }
+}
\`\`\`

Look for race conditions and security issues.`,
    expectRedacted: true,
    mustContain: ["adversarial code review", "race conditions", "[code block removed]"],
    mustNotContain: ["buildOperatorPlan", "provenanceStatus"],
  },
  {
    name: "empty prompt — must NOT redact",
    input: "",
    expectRedacted: false,
  },
  {
    name: "only a single +/- line (not a runs-of-3+ diff) — must NOT redact",
    input: "Note: + means added, - means removed.",
    expectRedacted: false,
  },
  {
    name: "markdown bullet list (3+ items) — must NOT redact (no diff anchor)",
    input: "Things to consider:\n- auth flow\n- rate limiting\n- error handling\nThoughts?",
    expectRedacted: false,
    mustContain: ["auth flow", "rate limiting", "error handling"],
    mustNotContain: ["[diff removed]"],
  },
  {
    name: "mixed +/- bullet list (no diff anchor) — must NOT redact",
    input: "Pros and cons:\n+ ships fast\n+ small diff\n- adds dependency\n- breaks API\nDecide?",
    expectRedacted: false,
    mustContain: ["ships fast", "breaks API"],
    mustNotContain: ["[diff removed]"],
  },
  {
    name: "raw unfenced unified diff with --- a/ +++ b/ anchors — must redact code AND context lines",
    input:
      "Look at this:\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1,3 +1,3 @@\n-const x = 1;\n+const x = 2;\n function buildOperatorPlan() {}\nWhat do you think?",
    expectRedacted: true,
    mustContain: ["[diff removed]", "Look at this", "What do you think"],
    mustNotContain: ["const x = 2", "buildOperatorPlan"],
  },
  {
    name: "raw unfenced unified diff with @@ hunk header only — must redact",
    input: "@@ -10,3 +10,3 @@\n-old line\n+new line\n unchanged",
    expectRedacted: true,
    mustContain: ["[diff removed]"],
  },
  {
    name: "diff followed by markdown bullet list later in prompt — bullets survive (no cross-contamination)",
    input:
      "Review:\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n\nThen also consider:\n- option A\n- option B\n- option C\nThanks.",
    expectRedacted: true,
    mustContain: ["[diff removed]", "option A", "option B", "option C", "Thanks"],
    mustNotContain: ["+new", "-old"],
  },
];

let passed = 0;
let failed = 0;
for (const c of cases) {
  const out = stripPastes(c.input);
  const errs: string[] = [];
  if (out.redacted !== c.expectRedacted) {
    errs.push(`expected redacted=${c.expectRedacted}, got ${out.redacted}`);
  }
  for (const s of c.mustContain ?? []) {
    if (!out.prompt.includes(s)) errs.push(`output missing required substring: ${JSON.stringify(s)}`);
  }
  for (const s of c.mustNotContain ?? []) {
    if (out.prompt.includes(s)) errs.push(`output contains forbidden substring: ${JSON.stringify(s)}`);
  }
  if (errs.length === 0) {
    passed++;
    console.log(`  PASS  ${c.name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${c.name}`);
    for (const e of errs) console.error(`        ${e}`);
  }
}

console.log("");
console.log(`${passed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
