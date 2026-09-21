// Prompt classifiers shared by the UserPromptSubmit hooks.

// Terse acknowledgements
const TRIVIAL_REPLY_PATTERN = /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i;

export function isTerseReply(prompt: string): boolean {
  return TRIVIAL_REPLY_PATTERN.test(prompt.trim());
}

// Patterns to skip context injection
const SKIP_CONTEXT_PATTERNS = [
  TRIVIAL_REPLY_PATTERN,
  /^\//, // slash commands
];

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

export function isHarnessInjected(prompt: string): boolean {
  const trimmed = prompt.trim();
  return HARNESS_INJECTED_PATTERNS.some((p) => p.test(trimmed));
}

export function shouldSkipContextRetrieval(prompt: string): boolean {
  return SKIP_CONTEXT_PATTERNS.some((p) => p.test(prompt.trim()));
}
