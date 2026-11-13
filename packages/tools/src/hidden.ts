// Maps hidden from the Power Map by a curation review, never deleted: each stays in the store and its flower
// still opens; every list of the map leaves it out, its own card says why, and taking its line out of
// hidden-maps.json brings it back. The file is the record of what was decided and why.
import hidden from './hidden-maps.json' with { type: 'json' };
import retired from './retired-readings.json' with { type: 'json' };

export interface Hidden {
  about: string;
  name: string;
  why: string;
  /** the decision, where it isn't the file's own */
  decided?: string;
}

const BY_ABOUT = new Map<string, Hidden>((hidden.hidden as Hidden[]).map((h) => [h.about, h]));

/** Why a map is hidden, and the decision, or null for a map that's shown. */
export function hiddenMap(about: string): (Hidden & { decided: string }) | null {
  const h = BY_ABOUT.get(about);
  return h ? { ...h, decided: h.decided ?? hidden.decided } : null;
}

/** How many maps are hidden. */
export const hiddenCount = () => BY_ABOUT.size;

export interface Retired {
  snapshot: string;
  replaced_by: string;
  /** what changed */
  from: string;
}

const RETIRED = new Map<string, Retired>(
  (retired.retired as Retired[]).map((r) => [r.snapshot, r]),
);

/**
 * A reading a mapping run replaced (retired-readings.json: retire, never delete), or null: it
 * stays in the store and its flower still opens by its hash, but no list of the map shows it.
 */
export function retiredReading(snapshot: string): (Retired & { decided: string }) | null {
  const r = RETIRED.get(snapshot);
  return r ? { ...r, decided: retired.decided } : null;
}

export interface RetiredClaim {
  id: string;
  replaced_by: string;
  /** what changed */
  from: string;
}

const RETIRED_CLAIMS = new Map<string, RetiredClaim>(
  ((retired as { claims?: RetiredClaim[] }).claims ?? []).map((c) => [c.id, c]),
);

/**
 * A mapping claim a mapping run reissued (retired-readings.json, claims), or null: it stays in the store,
 * but no map's list of the mapping's claims shows it, and search leaves it out.
 */
export function retiredClaim(id: string): (RetiredClaim & { decided: string }) | null {
  const c = RETIRED_CLAIMS.get(id);
  return c ? { ...c, decided: retired.decided } : null;
}
