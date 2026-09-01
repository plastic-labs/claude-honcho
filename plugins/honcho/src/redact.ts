/**
 * Best-effort secret redaction for uploaded content.
 * Regex-based, so novel secret formats pass through; users extend the
 * defaults via the `redactPatterns` config.
 */

interface RedactRule {
  pattern: RegExp;
  replacement: string;
}

/**
 * One complete shell word. Adjacent quoted, escaped and bare fragments are a
 * single value to the shell, so `PGPASSWORD=pre"secret suffix"` must redact
 * whole rather than stopping at `pre`. Shared by the assignment and CLI-flag
 * rules: two copies would be free to drift apart.
 */
const SHELL_WORD = String.raw`(?:"(?:\\[\s\S]|[^"\\])*"|'[^']*'|\\[\s\S]|[^\s;|&"'\\])+`;

/**
 * Ends a token shape. A terminal `\b` cannot follow a `-`, which left tokens
 * ending in a hyphen matched short — or, at their minimum length, not matched
 * at all, since there is nothing to backtrack into.
 */
const TOKEN_END = String.raw`(?![A-Za-z0-9_-])`;

/**
 * The part of a CLI flag name that marks its value as a secret. It must END the
 * name (an `-id` tail aside), the same discipline the JSON/YAML rule uses: a
 * merely-contained word would redact every `--max-tokens` and `--password-policy`
 * in a transcript. Qualifiers on the front are free, so `--auth-token` and
 * `--aws-secret-access-key` match without being listed one by one — the fixed
 * whole-name list this replaced matched `--auth` but not `--auth-token`, and had
 * no `--access-key` at all.
 */

const SECRET_FLAG_TAIL =
  String.raw`(?:password|passwd|passphrase|pwd|secret|token|bearer|credentials?|auth` +
  String.raw`|(?:api|access|private|secret|signing|encryption)[-_]?key` +
  // Names that end past the secret word, each one known to carry the value
  // itself: `--secret-string` is how AWS Secrets Manager takes it, and curl's
  // `--user` is `login:password`. A username redacted with them is cheap.
  String.raw`|secret[-_]?(?:string|value)|connection[-_]?string|user[-_]?pass(?:word)?|user)`;

const DEFAULT_RULES: RedactRule[] = [
  // PEM private key blocks (PKCS#8, RSA, EC, OpenSSH, etc.)
  {
    pattern: /-----BEGIN ((?:[A-Z0-9]+ )?PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
    replacement: "***",
  },
  // KEY=value assignments with a secret-bearing key (PGPASSWORD=..., AWS_SECRET_ACCESS_KEY=...)
  {
    pattern: new RegExp(
      String.raw`\b(\w*(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_?KEY|ACCESS_KEY|CREDENTIALS?)\w*)\s*=\s*` +
        SHELL_WORD,
      "gi",
    ),
    replacement: "$1=***",
  },
  // --password / --token style CLI flags. The space form refuses only a value
  // starting with `--`, which no token shape does, so `--no-auth --verbose`
  // stops eating the next flag. A single `-` stays fair game: base64url values
  // begin with one about once in 64, and losing those to a prettier `--password
  // -u root` would trade a permanent leak for cosmetics.
  {
    pattern: new RegExp(
      String.raw`(--(?:[a-z0-9]+[-_])*${SECRET_FLAG_TAIL}(?:[-_]id)?(?:=|[ \t]+))` +
        SHELL_WORD,
      "gi",
    ),
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
  // JSON/YAML secret assignments. Require a secret-bearing key suffix so
  // ordinary fields such as token_count and password_policy stay intact.
  {
    pattern: /(^|[\s{,])((?:["'])?[a-z0-9_-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|credentials?|client[_-]?secret|private[_-]?key)(?:["'])?\s*:\s*)(?:(["'])(?:\\.|(?!\3)[^\\\r\n])*\3|[^\s#,\]}]+)/gim,
    replacement: "$1$2$3***$3",
  },
  // Credentials in URL query strings
  {
    pattern: /([?&](?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|auth|credentials?)=)[^&#\s"']+/gi,
    replacement: "$1***",
  },
  // JSON Web Tokens
  {
    pattern: new RegExp(
      String.raw`\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}` + TOKEN_END,
      "g",
    ),
    replacement: "***",
  },
  // Telegram bot tokens
  {
    pattern: new RegExp(String.raw`\b\d{9,10}:AA[A-Za-z0-9_-]{35,}` + TOKEN_END, "g"),
    replacement: "***",
  },
  // Well-known token shapes: Honcho, AWS, OpenAI/Anthropic-style sk-, NVIDIA, Google, GitHub, Slack, GitLab, npm
  {
    pattern: new RegExp(
      String.raw`\b(?:hch[_-]?[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,}|nvapi-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{35}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36})` +
        TOKEN_END,
      "g",
    ),
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
