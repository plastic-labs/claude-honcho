# ADR-0001: Model-id als message-metadata voor alle Honcho-clients

**Status:** Accepted
**Date:** 2026-08-29
**Deciders:** Geert van Zoest

## Context

Honcho-sessies tonen als afzender alleen de stabiele AI-peer-naam (bv. `claude`,
`opencode`, `hermes`). Voor Geert is het wezenlijk om te zien met welk model een
bericht/sessie is geproduceerd (`claude-fable-5` vs `claude-opus-4-8`;
`gemma-4-26b`/`gpt-oss-20b` bij Hermes/OpenCode). Drie clients schrijven naar
dezelfde Honcho-instantie: het claude-honcho plugin (deze repo), de
opencode-integratie en hermes-agent. Honcho biedt op workspace-, peer-, sessie-
én message-niveau een user-facing `metadata` key-value store (`h_metadata`
JSONB); de officiële SDK-docs gebruiken zelf applicatie-eigen metadata-keys als
voorbeeld. Council-gereviewde research: zie sessie-synthese 2026-08-29
(star-chamber: gpt-5.4/glm-5.2/kimi-k3, geen blockers).

## Decision

Elke client stuurt het model-id mee als **message-metadata onder de key
`model`** (lowercase, het volledige model-id zoals de runtime het rapporteert).
Secundair houdt de client **sessie-metadata** bij: `models` (array van geziene
model-ids, volgorde van eerste optreden) en `last_model` — best-effort,
additief via get-merge-set. De peer-naam blijft stabiel per client.

## Options Considered

### Option A: `metadata.model` per message + sessie-metadata (gekozen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — bestaand metadata-mechanisme (naast `instance_id`, `type`, `session_affinity`) |
| Cost | Verwaarloosbaar; sessie-update alleen bij modelwissel |
| Scalability | Werkt per bericht, ook bij mid-sessie modelwissel (fast mode, subagents) |
| Team familiarity | Hoog — zelfde patroon in alle drie clients |

**Pros:** één representatie/werkgeheugen per peer blijft intact; per bericht
exact; queryable; consistent over clients.
**Cons:** panel moet metadata renderen (UI-wijziging in honcho-panel);
historische berichten missen de key.

### Option B: peer-naam = model-id (afgewezen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low in de client, High in de gevolgen |
| Cost | Fragmentatie van representatie en werkgeheugen over N peers |
| Scalability | Slecht — elke modelwissel/fast-mode/subagent splitst de peer |
| Team familiarity | n.v.t. |

**Pros:** direct zichtbaar in elke bestaande UI zonder panel-wijziging.
**Cons:** Honcho bouwt per peer een representatie op; peer-per-model
fragmenteert het AI-zelfbeeld en de dialectic-context; sessie-deelname en
peer-config (SessionPeerConfig) verveelvoudigen; historie breekt bij elke
modelbump.

## Trade-off Analysis

Zichtbaarheid (B) is met een kleine panel-wijziging ook via A te bereiken; de
geheugen-fragmentatie van B is niet te repareren zonder datamigratie. Het
sessie-metadata-deel van A is bewust best-effort: `PUT /sessions/{id}` vervangt
het metadata-object, dus get-merge-set met alleen eigen keys; bij parallelle
schrijvers geldt last-writer-wins — acceptabel voor observability, geen harde
invariant.

## Consequences

- Makkelijker: model-attributie per bericht en per sessie, uniform over clients.
- Moeilijker: honcho-panel moet `metadata.model` en `last_model`/`models`
  renderen; afwezige key tonen als "onbekend".
- Te herzien: zodra Honcho upstream een first-class model-/agent-attributieveld
  introduceert, migreren we daarheen (upstream-first).

## Action Items

1. [ ] claude-honcho: `model` uit transcript-JSONL (`message.model`) → message-metadata + sessie-metadata (issue + PR, deze repo)
2. [ ] hermes-agent: zelfde keys bij de message-flush (issue in hermes-agent-config-repo)
3. [ ] opencode: zelfde keys in de opencode-Honcho-integratie (issue in opencode-config-repo)
4. [ ] honcho-panel: model-badge per bericht + sessie-niveau weergave (issue in honcho-panel-repo)
