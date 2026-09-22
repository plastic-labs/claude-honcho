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
