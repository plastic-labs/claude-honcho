// Prompt classifiers shared by the UserPromptSubmit read and write hooks.

// Terse acknowledgements
export const TRIVIAL_REPLY_PATTERN = /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i;

export function isTerseReply(prompt: string): boolean {
  return TRIVIAL_REPLY_PATTERN.test(prompt.trim());
}

// Harness-injected turns that Claude Code delivers in the user-message slot but
// the human never typed: background-task events, slash-command stdout, injected
// system reminders.
const HARNESS_INJECTED_PATTERNS = [
  /^<task-notification>/,
  /^<local-command-stdout>/,
  /^<command-name>/,
  /^<command-message>/,
  /^<system-reminder>/,
  /^<bash-(stdout|stderr|input)>/,
  // `<<...>>` sentinels the runtime re-submits through the user slot and
  // resolves at fire time (e.g. <<autonomous-loop-dynamic>> from /loop wakeups)
  /^<<[\w-]+>>$/,
];

// Reminder blocks the harness prepends to a typed prompt (worktree notice,
// background-task status); the user's text follows them.
const LEADING_REMINDERS = /^(?:\s*<system-reminder>[\s\S]*?<\/system-reminder>)+\s*/;

export function stripLeadingReminders(prompt: string): string {
  return prompt.replace(LEADING_REMINDERS, "");
}

export function isHarnessInjected(prompt: string): boolean {
  const trimmed = stripLeadingReminders(prompt).trim();
  return !trimmed || HARNESS_INJECTED_PATTERNS.some((p) => p.test(trimmed));
}

// Some terminals and harnesses wrap pasted text in a <pasted_content ...> tag;
// user skip patterns match the text inside it.
const PASTED_CONTENT_OPEN = /^<pasted_content\b[^>]*>/;
const PASTED_CONTENT_CLOSE = /<\/pasted_content>\s*$/;

export function stripPastedContentWrapper(prompt: string): string {
  const trimmed = prompt.trim();
  if (!PASTED_CONTENT_OPEN.test(trimmed)) return prompt;
  return trimmed.replace(PASTED_CONTENT_OPEN, "").replace(PASTED_CONTENT_CLOSE, "").trim();
}

/**
 * True when the prompt matches one of the user's `skipUserPatterns` (regex
 * source strings, tested without flags). Matching runs on the prompt after
 * leading harness reminders and a leading <pasted_content> wrapper are
 * stripped. Patterns that fail to compile are reported via `onInvalid` and
 * skipped — set_config validates on write, so this only guards hand-edited
 * config files.
 */
export function matchesSkipUserPattern(
  prompt: string,
  patterns: string[] | undefined,
  onInvalid?: (message: string) => void,
): boolean {
  if (!patterns?.length) return false;
  const text = stripPastedContentWrapper(stripLeadingReminders(prompt)).trim();
  for (const source of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(source);
    } catch (e) {
      onInvalid?.(`Ignoring invalid skipUserPatterns entry ${JSON.stringify(source)}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * A prompt the plugin neither uploads nor uses as a retrieval query: a
 * harness-injected turn, or one matching the user's `skipUserPatterns`.
 * Shared by the UserPromptSubmit write (save-user-message) and read
 * (user-prompt) hooks so both apply the same rule.
 */
export function isExcludedUserPrompt(
  prompt: string,
  skipPatterns: string[] | undefined,
  onInvalid?: (message: string) => void,
): boolean {
  return isHarnessInjected(prompt) || matchesSkipUserPattern(prompt, skipPatterns, onInvalid);
}
