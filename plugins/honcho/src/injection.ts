/**
 * Composable memory injection — the render layer shared by the injection hooks.
 *
 * The hooks own the SDK client, caching, and timeouts; this module owns the
 * pure mapping from a fetched-data bundle plus a selected component set to the
 * injected `additionalContext` payload and its visibility labels. Keeping the
 * composition here — rather than as scattered conditionals inside each hook —
 * makes the per-surface component menu a single source of truth, and keeps the
 * "which component renders how" decision in one place as the menu grows.
 */
import type { SessionStartComponent } from "./config.js";

/**
 * Data the session-start components render from. Every field is optional: a
 * component's data is only fetched when that component is selected, so an
 * unselected component simply has nothing to render.
 */
export interface SessionStartData {
  /** SDK `session.summaries().long` narrative (null on a fresh session). */
  summary?: string | null;
  /** `context().peerCard` — structured identity/attribute list, full length. */
  peerCard?: string[] | null;
  /** `context().representation` — derived prose doc, full length. */
  representation?: string | null;
}

/** The output of a composition: the payload Claude consumes plus the labels
 *  naming what was injected (for the user-facing systemMessage summary). */
export interface RenderedInjection {
  /** additionalContext payload. Empty string means "inject nothing". */
  content: string;
  /** Short labels of the emitted components, in injection order. */
  labels: string[];
}

/**
 * Render the SessionStart components, in the configured order, into one payload.
 * Components whose data is missing/empty are silently skipped (e.g. no summary
 * yet on a fresh session), so the labels reflect what was *actually* injected.
 */
export function renderSessionStart(
  components: SessionStartComponent[],
  data: SessionStartData,
): RenderedInjection {
  const parts: string[] = [];
  const labels: string[] = [];

  for (const component of components) {
    switch (component) {
      case "summary": {
        const summary = data.summary?.trim();
        if (summary) {
          parts.push(`Session summary: ${summary}`);
          labels.push("summary");
        }
        break;
      }
      case "peerRepresentation": {
        const rep = data.representation?.trim();
        if (rep) {
          parts.push(`Honcho stored representation of the user:\n${rep}`);
          labels.push("representation");
        }
        break;
      }
      case "peerCard": {
        const card = (data.peerCard ?? []).filter((item) => item?.trim());
        if (card.length) {
          parts.push(`Profile: ${card.join("; ")}`);
          labels.push(`peer card (${card.length} items)`);
        }
        break;
      }
    }
  }

  return { content: parts.join("\n\n"), labels };
}
