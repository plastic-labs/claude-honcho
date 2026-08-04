/**
 * Best-effort secret redaction for tool-capture summaries.
 * Applied once where the summary string is created (post-tool-use), so every
 * sink — UI systemMessage, activity log, Honcho upload — gets the safe copy.
 * Regex redaction is harm reduction, not a guarantee: novel secret formats
 * pass through. Users extend the defaults via the `redactPatterns` config.
 */

interface RedactRule {
  pattern: RegExp;
  replacement: string;
}

const DEFAULT_RULES: RedactRule[] = [
  // KEY=value assignments with a secret-bearing key (PGPASSWORD=..., AWS_SECRET_ACCESS_KEY=...)
  {
    pattern: /\b(\w*(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_?KEY|ACCESS_KEY|CREDENTIALS?)\w*)\s*=\s*("[^"]*"|'[^']*'|[^\s;|&"']+)/gi,
    replacement: "$1=***",
  },
  // --password / --token style CLI flags
  {
    pattern: /(--(?:password|passwd|pwd|token|api-?key|secret|auth)[= ])(?:"[^"]*"|'[^']*'|[^\s;|&"']+)/gi,
    replacement: "$1***",
  },
  // Authorization headers
  {
    pattern: /(authorization:\s*(?:bearer|basic|token)\s+)[^\s"']+/gi,
    replacement: "$1***",
  },
  // Credentials embedded in URLs (scheme://user:pass@host)
  {
    pattern: /([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)[^@\s]+@/gi,
    replacement: "$1***@",
  },
  // Well-known token shapes: AWS, OpenAI/Anthropic-style sk-, GitHub, Slack, GitLab, npm
  {
    pattern: /\b(?:AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36})\b/g,
    replacement: "***",
  },
];

/**
 * Validate a user-supplied pattern string. Returns an error message, or null
 * if it compiles. Used by set_config so bad regexes are rejected at write time.
 */
export function validateRedactPattern(source: string): string | null {
  try {
    new RegExp(source);
    return null;
  } catch (e) {
    return `Invalid regex ${JSON.stringify(source)}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Redact secrets from `text`. `extraPatterns` (from config `redactPatterns`)
 * are additive to the built-in defaults; matches are replaced whole with ***.
 * Patterns that fail to compile are skipped — set_config validates on write,
 * so this only guards hand-edited config files.
 */
export function redactSecrets(text: string, extraPatterns?: string[]): string {
  let result = text;
  for (const rule of DEFAULT_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  for (const source of extraPatterns ?? []) {
    try {
      result = result.replace(new RegExp(source, "gi"), "***");
    } catch {
      continue;
    }
  }
  return result;
}
