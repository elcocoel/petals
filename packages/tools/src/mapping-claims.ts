// Petals' own mapping's claims, for every viewer (Elco, 11 Nov: "show them"; META: readable for every viewer,
// through the seam): the waves' checked claims, kept as the mapping's own annotations, apart from any person's.
// None names a person: the loader checks each as a published claim. A map's are the claims about its accounts,
// any of its readings' petals or the map's own address, oldest first, the same for every viewer.
import type { Claim } from '@petal/core/types';
import { privateStore } from './drafts.ts';
import { mapsOf, mapViews } from './map.ts';
import { loadSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';

/** Whose they are: Petals' own mapping, which no person's id can be. */
export const MAPPING = 'mapping.petals.near';

/** Keep a wave's checked claims as the mapping's; one kept already stays as it was. How many are new. */
export async function keepMappingClaims(
  ctx: ToolContext,
  wave: string,
  claims: readonly Claim[],
): Promise<number> {
  return privateStore(ctx.config).annotation.add(
    claims.map((c, place) => ({
      owner: MAPPING,
      id: c.id,
      exploration: `mapping:${wave}`,
      subject: c.subject,
      verb: c.verb,
      kind: c.kind,
      body: JSON.stringify(c),
      credential: null,
      created_at: c.issued_at,
      place,
    })),
  );
}

/** A map's claims by Petals' mapping, or null for a map that isn't on the map. */
export async function mapClaims(ctx: ToolContext, id: string): Promise<Claim[] | null> {
  const card = mapsOf(await mapViews(ctx, undefined, { hidden: true })).find((m) => m.id === id);
  if (!card) return null;
  // a petal's id is its account in CAIP-10, or, in older readings, its bare address on the map's chain
  const chain = card.id.slice(0, card.id.lastIndexOf(':'));
  const key = (id: string) => (id.startsWith('eip155:') ? id.toLowerCase() : id);
  const accounts = new Set<string>([key(card.id)]);
  for (const r of card.readings)
    for (const p of (await loadSnapshot(ctx, r.snapshot)).participants)
      accounts.add(key(p.id.includes(':') ? p.id : `${chain}:${p.id}`));
  return (await privateStore(ctx.config).annotation.list(MAPPING))
    .filter((r) => accounts.has(key(r.subject)))
    .map((r) => JSON.parse(r.body) as Claim);
}
