# Harness e2e

One scripted run that drives a real harness (Claude Code with this plugin) through a
conversation against the [Honcho sandbox](https://github.com/plastic-labs/honcho/tree/main/sandbox)
and asserts that memory actually round-trips. Unit tests stop at the hook boundary.
This run covers what they cannot see: what the server ends up holding.

## Running it

From `plugins/honcho/`:

```bash
bun run e2e                       # build .stage, start the sandbox, run, assert, tear down
bun run e2e --variant unified     # one variant only
bun run e2e --model real          # a real model instead of the scripted mock (see below)
bun run e2e --keep                # leave the sandbox up and keep the run dirs
bun run e2e --no-build            # reuse an existing .stage/
```

You need Docker and [`uv`](https://docs.astral.sh/uv/) (the sandbox seeds itself with it on a
cold start). A cold run, including pulling and seeding the sandbox, takes about a minute. With
the sandbox already up, it takes about 10 seconds.

The sandbox comes from `plastic-labs/honcho` at the commit pinned in `sandbox.ts`
(`HONCHO_REF`), sparse-fetched into `~/.cache/claude-honcho-e2e/`. Set `HONCHO_SANDBOX_DIR` to
a honcho checkout to run against local sandbox changes instead. If a sandbox is already running
on `127.0.0.1:18000`, the run reuses it and leaves it running. Every run writes to its own
fresh workspace, so it never resets or disturbs existing state.

### Model modes

Honcho always runs its mock provider. Claude Code's model is chosen per run:

- **mock (default, and the only mode CI uses).** `anthropic-mock.ts` serves a scripted Anthropic
  Messages API on a free localhost port: streamed `/v1/messages` with text and `tool_use` blocks,
  plus `count_tokens`. Claude Code reaches it through `ANTHROPIC_BASE_URL` and a dummy
  `ANTHROPIC_API_KEY`. The script (`claudeCodeScript` in `harnesses/claude-code.ts`) calls real
  Claude Code tools, `Bash` with `run_in_background` and `Read`, so the command output and the
  `<task-notification>` the plugin sees are produced by Claude Code itself. Free, deterministic,
  no credentials. Every request lands in `anthropic-mock.jsonl` in the run dir, and anything
  unrecognised or unscripted is reported at the end of the run. The mock answers only to the
  model id it pins (`MOCK_MODEL`), which is what `claude` is launched with in this mode.
- **real (`--model real` or `E2E_MODEL=real`).** A real model, Haiku by default (`E2E_CLAUDE_MODEL`
  overrides it). It uses `ANTHROPIC_API_KEY` when set, otherwise your logged-in `claude` CLI.
  Use it to check that the scripted conversation still matches what a real model does with
  the same prompts. Each variant costs a few cents.

The assertions are the same in both modes, and none of them depends on what the model says.

### Isolation

`claude` runs with `HOME` pointed at a temporary run dir, so your `~/.honcho/config.json`,
`~/.claude` settings and installed plugins (including an installed copy of this plugin) are never
read, and nothing is written to them. `HONCHO_*` and `CLAUDE_CODE_*` variables are stripped from
its environment. The plugin is loaded from `.stage/` with `--plugin-dir`, which is the bundled
tree users install.

In mock mode, `CLAUDE_CONFIG_DIR` is also a temporary dir and every inherited `ANTHROPIC_*`
variable is replaced. With nothing to log in with, Claude Code can only reach the mock. If it
reached the real API anyway, the Honcho checks would still pass, so the adapter refuses the run
unless the mock served each of the six scripted `/v1/messages` calls exactly once and the
replies are the scripted ones. No keychain link is made in this mode.

In real mode, credentials are carried across. `ANTHROPIC_API_KEY` needs nothing else. Without
it, the run links only the CLI's credential store into the isolated HOME: the login keychain
directory on macOS (`security` locates it via `HOME`), or `~/.claude/.credentials.json` on
Linux. The link is removed as soon as `claude` exits. No credential is read or copied by the
script.

## What it asserts

Turn 1 states a plain user fact. Turn 2 asks for a foreground command and a background
command, then ends the turn. The background command's completion comes back as a real
harness-injected `<task-notification>` turn, in which the model reads the command's output
and repeats it. The commands' outputs are computed by the shell (`TOOL$((40+2))OUT`), so they
never appear literally in a prompt.

Each variant then checks (`assert.ts`):

- **Round trip.** The workspace holds exactly one session, the one the integration names, so no
  empty or duplicate sessions. Each scripted prompt landed exactly once on the user peer, and
  each of the harness's final assistant replies, the wakeup turn included, landed exactly once
  on the AI peer. No assistant message was uploaded twice.
- **Negative.** User messages are exactly the scripted prompts. Nothing the harness injected (the
  task notification, or anything else in its transcript that is not a scripted prompt) and no
  command output is stored as the user speaking. The run first asserts that the harness really did
  inject something and that the model saw the background output, so this can't pass vacuously.
- **Topology.** The session's peers are exactly the user and AI peers, with the expected effective
  `observe_me` / `observe_others` as the server reports them.
- **Derivation and recall.** After the deriver queue drains, conclusions exist for every expected
  `(observer, observed)` pair. Every conclusion is present in that observer's `context()`, the
  call the plugin reads memory back through. Pairs the topology rules out must stay empty.

The `claude-code` adapter runs two variants. Under `unified` (the default), the user's
self-collection is the memory, and the AI must not build its own view of the user. Under
`directional`, the plugin sets `observe_others` on the AI peer, and the AI's view of the user
must fill up.

What it deliberately does not assert, because the sandbox runs Honcho's mock provider: the text
or level of derived conclusions (they are synthetic placeholders, always `explicit`), and
anything ranked by embeddings, including message search. Mock embeddings carry no similarity.
See the sandbox README.

### Waiting for asynchronous uploads

The plugin uploads from `async` hooks. `claude -p` cancels async hooks that are still running when
it exits, which can drop a session's final assistant message. The adapter keeps one
`--input-format stream-json` session open and waits until every started hook has reported back
before it sends the next turn or closes stdin (`--include-hook-events`). The driver also polls
Honcho until the expected messages land.

## Layout

| File                       | Harness-specific? | Purpose                                                       |
| -------------------------- | ----------------- | ------------------------------------------------------------- |
| `run.ts`                   | no                | Entry point: build, sandbox lifecycle, variants, report        |
| `sandbox.ts`               | no                | Pinned honcho checkout, `sandbox.sh up/down`, health check     |
| `scenario.ts`              | no                | The scripted turns, commands and output markers                |
| `assert.ts`                | no                | Every assertion, against the Honcho API only                   |
| `harness.ts`               | no                | The adapter contract                                           |
| `anthropic-mock.ts`        | no                | Scripted Anthropic Messages API server, for any Anthropic client |
| `harnesses/claude-code.ts` | yes               | Configure, invoke and read back Claude Code, plus its model script |

## Adopting it for a second integration

The harness-specific part is how to invoke the harness and where its transcript lands. To add
one (say an opencode or Cursor integration), write `harnesses/<name>.ts` exporting a
`HarnessAdapter` (see `harness.ts`) and register it in `HARNESSES` in `run.ts`. The adapter
supplies:

1. **`preflight()`**: fail fast if the harness binary is missing, or the model credentials in
   real mode.
2. **One or more `variants`**, each with a `run(ctx)` that:
   - creates an isolated HOME and working dir under `ctx.runDir`, and writes the integration's
     config there, pointing it at `ctx.baseUrl` and `ctx.workspace` with a user peer derived from
     `ctx.runId`. Integrations that share `~/.honcho/config.json` use a `hosts.<host>` block, as
     the Claude Code adapter does;
   - points the harness's model at a mock. A harness that speaks the Anthropic API can reuse
     `anthropic-mock.ts` with its own script, written against that harness's tool names. One
     on another provider needs an equivalent server;
   - sends each `ctx.turns[i].prompt` verbatim as a user turn, non-interactively. For a turn with
     `expectsWakeup`, it waits for the harness's own follow-up turn when the background command
     finishes. The scenario assumes the harness reports background-command completion back as
     a turn. A harness with no such mechanism needs its own second turn that produces real
     injected content. Don't fake one by sending the injected shape as a prompt;
   - waits until the harness's asynchronous uploads have finished;
   - returns `assistantReplies` (the final reply of every model turn), `transcriptUserTexts`
     (every user-role text in the harness's own transcript, which is what the injected-content
     checks are built from), and `artifacts` (log paths for failures);
   - returns the `Expectation`: the session name the integration should use, the user and AI
     peer ids, the effective topology per peer, and which `(observer, observed)` pairs must and
     must not get conclusions under its observation mode.

The scenario, sandbox handling and assertions are shared and need no changes. If the integration
lives in another repo, copy `e2e/` without `harnesses/claude-code.ts` and keep `HONCHO_REF` in
step. CI needs a job like `e2e` in `.github/workflows/ci.yml`: Docker, `uv` and the harness CLI.

## CI

The script is coupled to Claude Code's wire behaviour (which tools exist, how a background task
reports back, the request shape), so CI pins `@anthropic-ai/claude-code` in the `e2e` job to the
version the mock was validated against. To bump it, change that version, run `bun run e2e`
locally with the same CLI version, and fix the script if the mock log shows `unscripted` or
`unrecognized` requests or the served-calls check fails. A `bun run e2e --model real` run with
the new version confirms the script still matches what a real model does.

The `e2e` job in `.github/workflows/ci.yml` runs after `build` on every push to `main` and every
pull request, fork pull requests included. It runs in mock mode only and uses no secrets. On
failure, it uploads the `harness-e2e` artifact: the Claude event stream and transcript, the mock's
request log, the plugin's `~/.honcho` logs and the sandbox container logs.
