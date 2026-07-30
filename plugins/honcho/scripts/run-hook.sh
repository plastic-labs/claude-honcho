#!/bin/sh
# Upstream #82 — resolve `bun` for the hook environment, and FAIL LOUDLY if it
# is missing.
#
# Claude Code runs hooks non-interactively, so they do not necessarily inherit
# the shell PATH the user installed bun onto (no .zshrc/.bashrc sourcing). When
# `bun` was invoked directly from hooks.json, a missing bun meant every hook
# exited non-zero with an empty message and memory capture simply stopped —
# nothing in the transcript, nothing in the plugin's own log (the log is written
# by the TypeScript that never got to run).
#
# The guard therefore has to live OUTSIDE the TypeScript: a fix written in TS
# cannot run when the runtime that executes TS is the thing that is missing.
#
# POSIX sh only, no dependencies, no stdin reads (the hook payload on stdin must
# reach the exec'd process untouched), and one `exec` so no extra process
# lingers on the hot path.
#
# Precedent for shelling out from hooks.json: SessionStart already invokes
# `bash "${CLAUDE_PLUGIN_ROOT}/scripts/check-version.sh"`, so a shell entry point
# is an established, working shape for this plugin on every supported platform.
#
# Overrides (both optional):
#   HONCHO_BUN            absolute path to the bun binary to use
#   HONCHO_BUN_CANDIDATES space-separated list replacing the default search list
set -u

if [ "$#" -lt 1 ]; then
  echo "honcho: run-hook.sh requires a hook script path" >&2
  exit 1
fi

HOOK_SCRIPT="$1"
shift

DEFAULT_CANDIDATES="${HOME:-}/.bun/bin/bun /opt/homebrew/bin/bun /usr/local/bin/bun /usr/bin/bun ${HOME:-}/.local/bin/bun"
CANDIDATES="${HONCHO_BUN_CANDIDATES:-$DEFAULT_CANDIDATES}"

BUN_BIN=""

if [ -n "${HONCHO_BUN:-}" ] && [ -x "${HONCHO_BUN}" ]; then
  BUN_BIN="${HONCHO_BUN}"
else
  # `command -v` is a shell builtin: no subprocess, no stdin, no measurable cost.
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
  else
    for candidate in $CANDIDATES; do
      if [ -x "$candidate" ]; then
        BUN_BIN="$candidate"
        break
      fi
    done
  fi
fi

if [ -z "$BUN_BIN" ]; then
  # Exit non-zero WITHOUT writing to stdout. Per Claude Code's hook reference, a
  # non-zero exit other than 2 is a non-blocking error and "the transcript shows
  # a <hook name> hook error notice followed by the first line of stderr", so
  # this surfaces without --debug and without needing the JSON channel. Writing
  # to stdout would be wrong here: on UserPromptSubmit, exit-0 stdout is injected
  # into the model's context, so a diagnostic there could become fake memory.
  echo "honcho: 'bun' not found - memory capture is DISABLED for this session. Claude Code runs hooks without your shell PATH; install bun (https://bun.sh) or set HONCHO_BUN=/absolute/path/to/bun. Searched PATH plus: $CANDIDATES" >&2
  exit 1
fi

exec "$BUN_BIN" run "$HOOK_SCRIPT" "$@"
