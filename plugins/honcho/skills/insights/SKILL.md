---
description: Distill accumulated Honcho memory into concrete Claude Code config updates — CLAUDE.md edits, output-style rules, and skill ideas
allowed-tools: chat, honcho_remember, get_context, Read, Glob, AskUserQuestion, Write, Edit
user-invocable: true
---

# Honcho Insights

Run a deep dialectic pass over everything Honcho has accumulated about the user, and turn it
into changes they can actually make to their Claude Code setup: CLAUDE.md rules, output-style
adjustments, and skills worth writing.

This is a distillation, not a recall. The dialectic already answers "what do you know about
me". The job here is to convert that into a short, ranked list of edits.

## Arguments

`/honcho:insights` takes an optional focus, e.g. `/honcho:insights prose` or
`/honcho:insights skill ideas for the deploy flow`. When given, aim every query at that focus
and drop the other axes. With no argument, cover all of them.

## Step 1: Read what already exists

Proposals are diffs, not restatements. Before querying, read the current setup so anything
already written down can be excluded:

- `~/.claude/CLAUDE.md` and the project's `CLAUDE.md` (repo root, plus `.claude/CLAUDE.md`)
- the active output style, if any, under `~/.claude/output-styles/`
- skill names under `~/.claude/skills/` and `.claude/skills/` (names only, don't read bodies)

Missing files are normal. Note what you found in one line, then move on.

## Step 2: Query the dialectic

Prefer **one `chat` call at `reasoning_level: "max"`**. The dialectic plans its own retrieval,
so a single wide question beats several narrow ones, and max reasoning is the point of this
command. Include the "already covered" list in the prompt so it spends its budget on gaps.

```
chat({
  reasoning_level: "max",
  query: "I am distilling what you know about this user into their Claude Code configuration. \
Give me behavior-shaping observations, not biography. Cover: (1) how they want an agent to \
work — autonomy, what needs approval, how they react to being asked vs. told; (2) \
communication and prose preferences, with concrete examples of phrasing they accepted or \
rejected; (3) multi-step workflows they have walked through more than once, which could \
become a reusable skill; (4) corrections they have given — things they asked not to be done \
again; (5) tooling, environment, and project defaults that should be assumed rather than \
asked. For each observation, state the evidence you are drawing on and how confident you are. \
Skip anything on this list, which is already written into their config: <the list from step 1>."
})
```

If that call errors or hits the 120s ceiling, fall back to `honcho_remember` with
`reasoning_level: "high"` and one query per axis (max 5, they run in parallel):

1. How does this user want an agent to behave — autonomy, gating, what needs approval first?
2. What are their communication and prose preferences, with examples they accepted or rejected?
3. What multi-step workflows have they repeated, that could be automated as a skill?
4. What corrections or frustrations have they voiced — things to stop doing?
5. What tooling, environment, and project defaults should be assumed without asking?

Use `get_context` only if both paths come back thin — it is raw material, not analysis.

## Step 3: Filter

Keep an observation only if all of these hold:

- **Actionable**: it changes what the agent does, not just what it knows. "Works at a startup"
  is out; "wants the cost of the rejected option named" is in.
- **Recurring**: true across sessions, not a one-off from a single conversation.
- **New**: not already covered by the files from step 1.
- **Placeable**: you can say which file it belongs in.

Convert relative dates to absolute. Drop anything you cannot ground in something the dialectic
actually said — an invented rule is worse than a short list. If the dialectic came back thin,
say so plainly and stop; do not pad.

## Step 4: Present

Cap the whole thing at ~10 items, ranked by how much they would change day-to-day behavior.
Each item is at most three lines: the rule, the evidence, the destination. No preamble.

Group under whichever of these have content:

- **CLAUDE.md** — proposed lines, written in the voice of the target file, split by global vs.
  project. Show them diff-shaped (`+` for added, `~` for changed).
- **Output style** — tone and formatting rules. Give one rendered example per rule; a rule
  about prose is unreviewable without a sample of the prose.
- **Skill ideas** — name, trigger phrase, what it would encode, and the evidence that it
  happens often enough to be worth writing.

Then stop and wait. Do not start editing.

## Step 5: Apply, on request only

Never write a file before the user picks. Once they have:

- Ask with `AskUserQuestion`: apply all, pick a subset, or nothing.
- Edit in place, matching the target file's existing structure and voice. Append to an existing
  section rather than creating a new one where one fits.
- Skill ideas get scaffolded only if asked for by name — a skill nobody asked for is clutter.
- Recap what changed in one line per file.
