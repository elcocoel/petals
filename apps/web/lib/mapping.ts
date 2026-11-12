// /make's two states (Elco, 12 Nov: "we need to define the 'exploring' and 'mapping' states and the change and on
// the mapping state there should be a clear indicator of what data layers and claims I would be adding").
// Exploring reads what's there; mapping is what the person would add to the map in front of them, in their name:
// each layer's share (SYSTEMS's adds), what can't go yet and why, every item, and the press. Words are drafts.
import type { PublishAdds, PublishableData } from './agent-client.ts';

export type Mode = 'exploring' | 'mapping';

export const modeWords = {
  exploring: 'Exploring',
  mapping: 'Mapping',
  heading: (name: string | null) => (name ? `Mapping ${name}` : 'Mapping'),
  intro: 'What you’d add to it, in your name',
  /** one line per layer: Insights · Names · 35 */
  adds: (a: PublishAdds) =>
    a.label === a.layer ? `${a.layer} · ${a.count}` : `${a.layer} · ${a.label} · ${a.count}`,
  later: 'Not yet',
  noMap: 'Go into a map to see what you’d add to it.',
  nothing:
    'Nothing of yours to add here yet. Map something new, or add a note or a name to a petal.',
} as const;

export interface AddsLine {
  key: string;
  line: string;
  goes: boolean;
  /** why it can't go yet, when it can't */
  why: string | null;
}

export interface MappingView {
  heading: string;
  intro: string;
  adds: AddsLine[];
  /** said when there's nothing to add, or no map in front */
  empty: string | null;
}

export function mappingView(
  map: string | null,
  name: string | null,
  data: PublishableData | null,
): MappingView {
  const heading = modeWords.heading(name ?? data?.name ?? null);
  if (!map) return { heading, intro: modeWords.intro, adds: [], empty: modeWords.noMap };
  const adds = (data?.adds ?? []).map((a) => ({
    key: `${a.layer}:${a.kind}:${a.verb ?? a.label}`,
    line: modeWords.adds(a),
    goes: a.goes,
    why: a.goes ? null : (a.why ?? modeWords.later),
  }));
  const any = (data?.ready ?? 0) > 0 || (data?.private.length ?? 0) > 0 || adds.length > 0;
  return { heading, intro: modeWords.intro, adds, empty: any ? null : modeWords.nothing };
}
