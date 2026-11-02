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
bun run e2e --keep                # leave the sandbox up and keep the run dirs
bun run e2e --no-build            # reuse an existing .stage/
```

You need Docker, [`uv`](https://docs.astral.sh/uv/) (the sandbox seeds itself with it on a cold
start), and Anthropic credentials: either `ANTHROPIC_API_KEY`, or a `claude` CLI that is logged
in. A cold run, including pulling and seeding the sandbox, takes about 100 seconds. With the
sandbox already up it takes about 30. Each variant costs a few cents of Haiku
(`E2E_CLAUDE_MODEL` overrides the model).

The sandbox comes from `plastic-labs/honcho` at the commit pinned in `sandbox.ts`
(`HONCHO_REF`), sparse-fetched into `~/.cache/claude-honcho-e2e/`. Set `HONCHO_SANDBOX_DIR` to
a honcho checkout to run against local sandbox changes instead. If a sandbox is already running
on `127.0.0.1:18000`, the run reuses it and leaves it running. Every run writes to its own
fresh workspace, so it never resets or disturbs existing state.

### Isolation

`claude` runs with `HOME` pointed at a temporary run dir, so your `~/.honcho/config.json`,
`~/.claude` settings and installed plugins (including an installed copy of this plugin) are never
read, and nothing is written to them. `HONCHO_*` and nested-session `CLAUDE_CODE_*` variables are
stripped from its environment. The plugin is loaded from `.stage/` with `--plugin-dir`, which is
the bundled tree users install.

Credentials are the one thing carried across. With `ANTHROPIC_API_KEY` set, nothing else is
needed. Without it, the run links only the CLI's credential store into the isolated HOME: the
login keychain directory on macOS (`security` locates it via `HOME`), or
`~/.claude/.credentials.json` on Linux. The link is removed as soon as `claude` exits. No
credential is read or copied by the script.

## What it asserts

Turn 1 states a plain user fact. Turn 2 asks the model to run a foreground command and to start a
background command, then to end its turn. The background command's completion comes back as a
real harness-injected `<task-notification>` turn. The commands' outputs are computed by the shell
(`TOOL$((40+2))OUT`), so they never appear literally in a prompt.

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

What it deliberately does not assert, because the sandbox runs the mock provider: the text or level
of derived conclusions (they are synthetic placeholders, always `explicit`), and anything ranked by
embeddings, including message search. Mock embeddings carry no similarity. See the sandbox README.

### Waiting for asynchronous uploads

The plugin uploads from `async` hooks. `claude -p` cancels async hooks that are still running when
it exits, which can drop a session's final assistant message. The adapter keeps one
`--input-format stream-json` session open and waits until every started hook has reported back
before it sends the next turn or closes stdin (`--include-hook-events`). The driver also polls
Honcho until the expected messages land.

## Layout

| File                     | Harness-specific? | Purpose                                                   |
| ------------------------ | ----------------- | --------------------------------------------------------- |
| `run.ts`                 | no                | Entry point: build, sandbox lifecycle, variants, report    |
| `sandbox.ts`             | no                | Pinned honcho checkout, `sandbox.sh up/down`, health check |
| `scenario.ts`            | no                | The scripted turns and the command-output markers          |
| `assert.ts`              | no                | Every assertion, against the Honcho API only               |
| `harness.ts`             | no                | The adapter contract                                       |
| `harnesses/claude-code.ts` | yes             | Configure, invoke and read back Claude Code                |

## Adopting it for a second integration

The harness-specific part is how to invoke the harness and where its transcript lands. To add
one (say an opencode or Cursor integration), write `harnesses/<name>.ts` exporting a
`HarnessAdapter` (see `harness.ts`) and register it in `HARNESSES` in `run.ts`. The adapter
supplies:

1. **`preflight()`**: fail fast if the harness binary or its model credentials are missing.
2. **One or more `variants`**, each with a `run(ctx)` that:
   - creates an isolated HOME and working dir under `ctx.runDir`, and writes the integration's
     config there, pointing it at `ctx.baseUrl` and `ctx.workspace` with a user peer derived from
     `ctx.runId`. Integrations that share `~/.honcho/config.json` use a `hosts.<host>` block, as
     the Claude Code adapter does;
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
step. CI needs a job like `e2e` in `.github/workflows/ci.yml`: Docker, `uv`, the harness CLI, and
its model key as a secret.

## CI

The `e2e` job in `.github/workflows/ci.yml` runs after `build` on every push to `main` and every
pull request, with the `ANTHROPIC_API_KEY` repository secret. Fork and Dependabot pull requests
do not receive secrets, so they skip with a warning annotation. Anywhere else, a missing secret
fails the job rather than passing untested. On failure, the job uploads the Claude event stream,
the Claude transcript, the plugin's `~/.honcho` logs and the sandbox container logs as the
`harness-e2e` artifact.
