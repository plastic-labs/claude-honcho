// Prompt classifiers shared by the prompt hooks and Stop's transcript parser.

import { existsSync } from "fs";

// Harness-injected turns that Claude Code delivers in the user-message slot but
// the human never typed: background-task events, slash-command stdout, injected
// system reminders.
const HARNESS_INJECTED_PATTERNS = [
  /^<task-notification(?=[\s/>])/,
  // Another Claude Code session's message (SendMessage), delivered in the user slot.
  // It is that agent's text, not the human's.
  /^<cross-session-message(?=[\s/>])/,
  // Subagent hand-backs are also delivered as user turns. Require a tag-name
  // delimiter, not \b (which would also match <agent-message-example>).
  /^<agent-message(?=[\s/>])/,
  // Keep known scaffold excluded when replay uses this classifier instead of
  // rejecting all XML-looking user content.
  /^<channel(?=[\s/>])/,
  /^<local-command-caveat(?=[\s/>])/,
  /^<local-command-stdout>/,
  /^<command-name>/,
  /^<command-message>/,
  /^<system-reminder(?=[\s/>])/,
  /^<bash-(stdout|stderr|input)>/,
  // `<<...>>` sentinels the runtime re-submits through the user slot and
  // resolves at fire time (e.g. <<autonomous-loop-dynamic>> from /loop wakeups)
  /^<<[\w-]+>>$/,
];

// Reminder blocks the harness prepends to a typed prompt (worktree notice,
// background-task status); the user's text follows them.
const LEADING_REMINDERS = /^(?:\s*<system-reminder(?=[\s>])[^>]*>[\s\S]*?<\/system-reminder>)+\s*/;

export function stripLeadingReminders(prompt: string): string {
  return prompt.replace(LEADING_REMINDERS, "");
}

// A typed slash command or skill invocation, recorded as
// `<command-message>…</command-message> <command-name>/…</command-name>` (either tag first).
const SLASH_COMMAND_ENVELOPE = /^<command-(name|message)>/;

export function isHarnessInjected(prompt: string): boolean {
  const trimmed = stripLeadingReminders(prompt).trim();
  return !trimmed || HARNESS_INJECTED_PATTERNS.some((p) => p.test(trimmed));
}

// A slash command or skill invocation ("/compact", "/honcho:config", "/loop 5m
// /foo"). A prompt that opens with an absolute path is not one, including a
// single-component path such as "/tmp is missing": Claude Code sends that to
// the model as text, so a name that exists at the filesystem root is a path.
const SLASH_COMMAND = /^\/([\w:-]+)(?:\s|$)/;

export function isSlashCommand(prompt: string): boolean {
  const trimmed = stripLeadingReminders(prompt).trim();
  // Stop sees transcript envelopes; UserPromptSubmit may see the raw command.
  if (SLASH_COMMAND_ENVELOPE.test(trimmed)) return true;
  const name = SLASH_COMMAND.exec(trimmed)?.[1];
  if (!name) return false;
  return name.includes(":") || !existsSync(`/${name}`);
}
