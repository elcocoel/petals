// Maps hidden from the Power Map, never deleted (board #96; Elco approved DAO SET's review, 11 Nov): each
// stays in the store and its flower still opens; every list of the map leaves it out, its own card says why,
// and taking its line out of hidden-maps.json brings it back. The file is the record of who decided and why.
import hidden from './hidden-maps.json' with { type: 'json' };

export interface Hidden {
  about: string;
  name: string;
  why: string;
  /** who decided, where it isn't the file's own decision */
  decided?: string;
}

const BY_ABOUT = new Map<string, Hidden>((hidden.hidden as Hidden[]).map((h) => [h.about, h]));

/** Why a map is hidden, and who decided, or null for a map that's shown. */
export function hiddenMap(about: string): (Hidden & { decided: string }) | null {
  const h = BY_ABOUT.get(about);
  return h ? { ...h, decided: h.decided ?? hidden.decided } : null;
}

/** How many maps are hidden. */
export const hiddenCount = () => BY_ABOUT.size;
