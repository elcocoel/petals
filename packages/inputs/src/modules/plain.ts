// Capabilities of a plain flower: one holdings measure, no segments. The Ethereum and Solana
// modules share this shape, and differ only in what their measure and colours mean.
import type { Capabilities } from '@petal/core/types';

export interface PlainFlower {
  measure: { id: string; unit: string; label: string };
  /** source ids behind the measure */
  sources: string[];
  /** what `kind` says here, and the sources it comes from */
  kind: { meaning: string; sources: string[] };
  /** what a name is here, and the sources it comes from */
  identity: { meaning: string; sources: string[] };
  defaults?: Capabilities['defaults'];
  relationships?: string[];
}

export function plainCapabilities(f: PlainFlower): Capabilities {
  const { id, label } = f.measure;
  const on = (meaning: string, sources = f.sources) => ({ meaning, sources });
  return {
    measures: [f.measure],
    by: {
      width: ['share', 'equal'],
      height: ['share', 'amount', 'equal'],
      colour: ['kind', 'identity', 'single'],
      outline: ['identity_status'],
      order: ['measure_desc'],
    },
    segments: [],
    relationships: f.relationships ?? [],
    defaults: { measure: id, ...f.defaults },
    meanings: {
      'width:share': on(`share of ${label}, compressed into a band`),
      'width:equal': on('every side the same width'),
      'height:sqrt': on(`square root of share of ${label}`),
      'height:linear': on(`share of ${label}`),
      'height:log': on(`${label}, on a log scale`),
      'height:equal': on('every bar the same height'),
      'colour:kind': on(f.kind.meaning, f.kind.sources),
      'colour:identity': on(f.identity.meaning, f.identity.sources),
      'colour:single': on('one colour for every petal'),
      'outline:identity_status': on(
        'solid when a source names the address and the name is self-declared; none when no source names it',
        f.identity.sources,
      ),
      'order:measure_desc': on(`largest ${label} first, clockwise from the top`),
    },
  };
}

/** `1,234,567` for notes, whatever the machine's locale. */
export const grouped = (n: number | bigint): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The date part of an ISO time, for notes. */
export const dayOf = (iso: string): string => iso.slice(0, 10);
