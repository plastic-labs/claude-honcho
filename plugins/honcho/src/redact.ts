/**
 * Secret redaction for captured tool summaries.
 *
 * Upstream issue #81: `formatToolSummary()` in hooks/post-tool-use.ts builds a
 * human-readable line for every significant tool call, and that line goes to TWO
 * places -- the terminal (`systemMessage`) and, when `saveToolUse: true`, up to
 * the Honcho server as durable memory. Nothing redacted it, so
 * `PGPASSWORD=... psql ...` or `export TOKEN=sk-... && ...` was captured verbatim.
 *
 * Design constraints:
 *  - No dependencies (not even node builtins) so this is trivially unit-testable
 *    and reviewable in isolation.
 *  - Structure-preserving: we keep the key/flag/scheme so a summary still says
 *    *that* `psql` ran, and only the value disappears.
 *  - Must run BEFORE any truncation. A secret sitting past a `.slice()` boundary
 *    would otherwise survive, and slicing a raw secret can leave a
 *    partially-visible fragment. Redact first, then slice.
 *  - Conservative in the safe direction: over-redacting a non-secret is
 *    acceptable, under-redacting is not. The one exception is that ordinary
 *    commands (`git status`, `npm run build`, `rg -n "pattern" src`) must pass
 *    through unchanged, or captured memory becomes useless.
 *  - Idempotent: redactSecrets(redactSecrets(x)) === redactSecrets(x). The hook
 *    applies redaction both to the raw command and to the assembled summary.
 *
 * The marker is deliberately plain ASCII. The bundler rewrites non-ASCII escapes
 * to raw UTF-8 bytes (see src/unicode.ts, which works around this with
 * String.fromCodePoint), and this string also lands in log files and server-side
 * memory where a guillemet buys nothing.
 */

export const REDACTED = "[redacted]";

/**
 * Long, unambiguous secret words. Matched as a SUBSTRING of the key name after
 * separators are stripped, so `PGPASSWORD`, `api_key`, `API-KEY`, `accessKeyId`
 * and `clientSecret` all hit.
 */
const BROAD_SECRET_WORDS = [
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "apikey",
  "accesskey",
  "credential",
  "bearer",
  "privatekey",
  "authorization",
  "cookie",
];

/**
 * Short / ambiguous words. Matched ONLY as a whole `_`/`-`/`.`-delimited segment.
 *
 * Substring matching these would wreck ordinary summaries: `pat` is inside
 * `path`, `patch` and `pattern`; `auth` is inside `author`. Segment matching
 * still catches `PAT=`, `gh_pat`, `--auth`, `X-AUTH-TOKEN` and `session`.
 *
 * Bare `key` is deliberately NOT here: `PRIMARY_KEY`, `SORT_KEY`, `CACHE_KEY`
 * and openssl/ssh/curl's `--key <file>` are common and non-secret, while every
 * key-shaped secret name (`api_key`, `access_key`, `secret_key`, `private_key`)
 * is already covered by BROAD_SECRET_WORDS.
 */
const SEGMENT_SECRET_WORDS = ["pwd", "auth", "session", "pat", "cred", "creds"];

/**
 * Does this key / flag / field name look like it holds a secret?
 *
 * Exported because the broad-vs-segment split is the single most important
 * decision in this module and deserves its own tests.
 */
export function isSensitiveKeyName(name: string): boolean {
  const lower = name.toLowerCase().replace(/^-+/, "");
  if (!lower) return false;
  const squashed = lower.replace(/[_\-.]/g, "");
  if (BROAD_SECRET_WORDS.some((w) => squashed.includes(w))) return true;
  return lower.split(/[_\-.]+/).some((seg) => SEGMENT_SECRET_WORDS.includes(seg));
}

/**
 * Credential VALUE shapes that are recognizable regardless of the key name.
 * All patterns are linear (no nested quantifiers) so they cannot backtrack
 * catastrophically on a large Edit payload.
 */
const VALUE_SHAPES: RegExp[] = [
  // OpenAI / Stripe-style `sk-...` (and `sk-live-`, `sk-ant-`, ...). The \b stops
  // it firing inside "task-", "risk-", "disk-".
  /\bsk-[A-Za-z0-9_-]{6,}/g,
  // GitHub personal-access / OAuth / user / server / refresh tokens.
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  // Slack bot/user/app/refresh/legacy tokens.
  /\bxox[abprse]-[A-Za-z0-9-]{8,}/g,
  // AWS access key id.
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  // JWT: three dot-separated base64url segments (signature may be empty).
  /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g,
];

/** `-----BEGIN ... PRIVATE KEY-----` blocks, terminated or not. */
function redactPemBlocks(input: string): string {
  if (!input.includes("PRIVATE KEY")) return input;
  return input
    .replace(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
      `-----BEGIN PRIVATE KEY----- ${REDACTED} -----END PRIVATE KEY-----`,
    )
    .replace(
      // The lookahead must name the private-key terminator, not a bare
      // `-----END`: in a PEM bundle the key is routinely followed by
      // `-----END CERTIFICATE-----`, which would otherwise satisfy the
      // lookahead and leave the key material untouched by both passes.
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?![\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----)[\s\S]*/g,
      `-----BEGIN PRIVATE KEY----- ${REDACTED}`,
    );
}

/**
 * Header-like fields whose value is the whole rest of the field, not a single
 * token: `Authorization: Bearer x`, `Authorization: token x`, `Cookie: a=b; c=d`.
 * Bounded by a quote or newline so a quoted `-H "..."` argument does not eat the
 * URL that follows it.
 */
function redactHeaderFields(input: string): string {
  return input.replace(
    /\b(authorization|proxy-authorization|set-cookie|cookie|x-api-key|api-key|x-auth-token)([ \t]*:[ \t]*)[^"'\n]+/gi,
    (_m, key: string) => `${key}: ${REDACTED}`,
  );
}

/** `scheme://user:password@host` -> `scheme://user:[redacted]@host` */
function redactUrlCredentials(input: string): string {
  return input.replace(
    /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]*)@/g,
    (_m, scheme: string, user: string) => `${scheme}${user}:${REDACTED}@`,
  );
}

function redactValueShapes(input: string): string {
  let out = input;
  for (const re of VALUE_SHAPES) out = out.replace(re, REDACTED);
  return out;
}

/** `Bearer <token>` wherever it appears (headers, curl args, prose). */
function redactBearerTokens(input: string): string {
  return input.replace(/\bBearer\s+[^\s"',;]+/gi, `Bearer ${REDACTED}`);
}

/**
 * CLI flags whose NAME looks sensitive: `--password X`, `--token=X`, `--api-key X`,
 * `--client-secret=X`. Two separate passes so the space form can refuse a value
 * starting with `-` -- otherwise `--foo --token X` would consume `--token` as
 * `--foo`'s value and never redact the real secret.
 */
function redactSensitiveFlags(input: string): string {
  let out = input.replace(
    /(--?[A-Za-z][A-Za-z0-9_.-]*)=("[^"]*"|'[^']*'|[^\s;&|]+)/g,
    (m, flag: string) => (isSensitiveKeyName(flag) ? `${flag}=${REDACTED}` : m),
  );
  out = out.replace(
    /(--?[A-Za-z][A-Za-z0-9_.-]*)([ \t]+)("[^"]*"|'[^']*'|[^\s-][^\s]*)/g,
    (m, flag: string, gap: string) =>
      isSensitiveKeyName(flag) ? `${flag}${gap}${REDACTED}` : m,
  );
  return out;
}

/**
 * `KEY=value` assignments -- shell env prefixes, `export KEY=value`, `-e KEY=value`.
 * The leading-character class excludes `-`, so `--token=x` is left to
 * redactSensitiveFlags rather than being matched here as key `token`.
 */
function redactAssignments(input: string): string {
  return input.replace(
    /(^|[\s;&|("'`])([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*=[ \t]*("[^"]*"|'[^']*'|[^\s;&|)"'`]+)/g,
    (m, lead: string, key: string) =>
      isSensitiveKeyName(key) ? `${lead}${key}=${REDACTED}` : m,
  );
}

/**
 * `KEY: value` -- JSON/YAML fields and HTTP headers.
 *
 * Deliberately position-bounded: the key must sit at the start of the string, at
 * the start of a line, after `{` or `,`, or immediately after a quote. Allowing
 * a bare preceding space would mangle prose that this hook really does capture
 * (`git commit -m "fix auth: broken login"` -> `fix auth: [redacted] login`).
 * The genuine header case is still covered here (it follows a quote) and twice
 * over by redactBearerTokens / redactValueShapes.
 */
function redactColonFields(input: string): string {
  return input.replace(
    /(^[ \t]*|[\n{,][ \t]*|["'`][ \t]*)([A-Za-z_][A-Za-z0-9_.-]*)(["'`]?)[ \t]*:[ \t]*("[^"]*"|'[^']*'|[^\s,;}"'`]+)/g,
    (m, lead: string, key: string, closeQuote: string) =>
      isSensitiveKeyName(key) ? `${lead}${key}${closeQuote}: ${REDACTED}` : m,
  );
}

/**
 * Tool-specific flags that take a secret but whose flag name says nothing:
 *  - mysql family `-pSECRET` (psql's `-p` is a PORT, so this is gated on the tool)
 *  - redis-cli `-a SECRET`
 *  - `-u user:password` / `--user user:password` (curl, wget) -- gated on the
 *    `user:password` shape rather than the tool, since `-u` means other things.
 */
function redactToolSpecificFlags(input: string): string {
  let out = input;
  if (/\bmysql(?:dump|admin|show)?\b/.test(out)) {
    out = out.replace(/(\s|^)-p(?=\S)("[^"]*"|'[^']*'|\S+)/g, `$1-p${REDACTED}`);
  }
  if (/\bredis-cli\b/.test(out)) {
    out = out.replace(/(\s|^)-a[ \t]+("[^"]*"|'[^']*'|[^\s-][^\s]*)/g, `$1-a ${REDACTED}`);
  }
  out = out.replace(
    /(\s|^)(-u|--user)([ \t]+|=)(["']?)([^\s:"']+):([^\s"']*)/g,
    (_m, lead: string, flag: string, sep: string, quote: string, user: string) =>
      `${lead}${flag}${sep}${quote}${user}:${REDACTED}`,
  );
  return out;
}

/**
 * Redact secret-bearing values from a string that is about to be shown to the
 * user or persisted as memory. Call this BEFORE truncating.
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  let out = input;
  out = redactPemBlocks(out);
  out = redactUrlCredentials(out);
  out = redactHeaderFields(out);
  out = redactValueShapes(out);
  out = redactBearerTokens(out);
  out = redactSensitiveFlags(out);
  out = redactAssignments(out);
  out = redactColonFields(out);
  out = redactToolSpecificFlags(out);
  return out;
}
