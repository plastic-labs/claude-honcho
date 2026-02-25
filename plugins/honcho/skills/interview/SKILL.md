---
name: honcho:interview
description: Interview the user to capture stable, cross-project preferences and save them to Honcho
allowed-tools: chat, create_conclusion
user-invocable: true
---

# Honcho Interview

Kick off a short interview to learn stable, cross-project aspects of the user and store them in Honcho memory.

## Guardrails

- Focus on global traits that are unlikely to change between projects.
- Avoid project-specific topics, credentials, addresses, or other sensitive information.
- Ask one question at a time and wait for the answer before proceeding.
- If an answer is vague, ask one brief clarification before saving a conclusion.
- If the user declines to answer, skip that topic and move on.
- Use existing knowledge to avoid repeating questions the memory already covers.

## Pre-Interview Context (Required)

Before asking any questions, use the `chat` tool to get a maximally thorough overview of what is already known about the user. Present a concise summary to the user, then tailor the interview to fill gaps or confirm uncertain areas.

Example tool call format:

```
chat({ "query": "Give a maximally thorough overview of what you already know about this user, focusing on stable preferences and cross-project traits. Include any uncertainties or gaps." })
```

## Interview Flow (Medium Depth)

Ask these questions in order, skipping any that are already answered by the pre-interview context:

1. Communication style: Do you prefer concise answers, detailed explanations, or a mix?
2. Tone: Do you prefer a direct, professional tone or a more conversational one?
3. Structure: Do you prefer bullet points, step-by-step instructions, or narrative explanations?
4. Technical depth: What level of technical detail should I assume (beginner, intermediate, expert)?
5. Learning preference: Do you prefer explanations first, examples first, or both together?
6. Code quality focus: What matters most by default (clarity, performance, tests, minimal changes)?
7. Collaboration style: Should I make changes directly, propose options first, or ask before edits?
8. Environment defaults: What OS/shell/tooling should I assume for commands and paths?

## Saving Conclusions

After each answer, create exactly one concise conclusion and call `create_conclusion`.

Guidelines for conclusions:

- Use a single sentence.
- Make it specific and unambiguous.
- Avoid hedging if the user gives a clear preference.

Example tool call format:

```
create_conclusion({ "content": "Prefers concise, bullet-pointed responses with a professional tone." })
```

## Wrap-up

When finished, briefly recap the conclusions you saved and ask if anything should be corrected. Only save a new conclusion if the user explicitly clarifies or corrects a prior answer.
