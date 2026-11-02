import type { Turn } from "./harness.js";

// The scripted conversation every harness is driven through.
//
// Turn 1 plants a plain user fact. Turn 2 makes the harness produce content of
// its own: a foreground command's stdout and a background command whose
// completion the harness reports back as an injected turn. Neither command's
// output appears literally in a prompt (the shell computes it), so finding a
// marker in a Honcho user message can only mean harness content was uploaded
// as the user.

export const FOREGROUND_MARKER = "TOOL42OUT";
export const BACKGROUND_MARKER = "BG63DONE";
export const FOREGROUND_COMMAND = "echo TOOL$((40+2))OUT";
// Long enough that the completion cannot race into turn 2 on a slow runner.
export const BACKGROUND_COMMAND = "sleep 10; echo BG$((60+3))DONE";

export const turns: Turn[] = [
  {
    prompt: "I keep a rubber duck called Quackenbush on my desk for debugging. Reply with one short sentence.",
  },
  {
    prompt:
      `Run \`${FOREGROUND_COMMAND}\` in the shell and wait for it. Then start \`${BACKGROUND_COMMAND}\` ` +
      "as a background task and end your turn right away, without waiting for it or checking on it: you " +
      "will be notified when it finishes. When notified, reply with exactly what it printed.",
    expectsWakeup: true,
  },
];

export const commandOutputMarkers = [FOREGROUND_MARKER, BACKGROUND_MARKER];

/** The only turn of the follow-up session that checks memory is read back
 *  into the model's context. Long enough not to be skipped as a terse reply. */
export const RECALL_PROMPT = "Before we continue, what do you remember about me and my desk setup?";

/** Unique conclusion texts written straight into two collections about the
 *  same user, so recall can tell which collection the context came from. */
export function recallProbes(runId: string): { probe: string; decoy: string } {
  return {
    probe: `Recall probe ${runId}: the user keeps a teal stapler named Ferdinand in drawer three.`,
    decoy: `Decoy probe ${runId}: the user owns a crimson kettle called Ottoline.`,
  };
}
