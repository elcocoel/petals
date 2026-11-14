'use client';
// What's said where a pin on the map stands (landscape/pins.ts), opened by a press on it: each claim under who said
// it, their picture, name and account first, then the claim as Insights says it (MapClaims). It floats over the map
// beside its pin; the map places it there on each frame through `card`, so it follows the pin. A box over the map,
// as the map's other boxes: the map's names keep clear of it.
import type { Claim } from '@petal/core/types';
import { type RefCallback, useMemo, useState } from 'react';
import { mapClaimGroups, mapClaimWords } from '../lib/map-claims.ts';
import { claimerOf, useClaimers } from '../viewmodels/useClaimers.ts';
import { MapClaims } from './MapClaims.tsx';
import { Avatar } from './ui/Avatar.tsx';
import { Mono } from './ui/Mono.tsx';

const KEEP_OPEN = { open: true, onToggle: () => undefined };

export function ClaimPinCard({
  claims,
  names,
  card,
  place,
}: {
  /** the pin's claims */
  claims: readonly Claim[];
  /** each account's petal name, on the pin's flower */
  names: ReadonlyMap<string, string>;
  /** the map places the card beside its pin on each frame */
  card: RefCallback<HTMLElement>;
  /** as the map is laid: over the whole window, or in its area of the page */
  place: 'fixed' | 'absolute';
}) {
  const [open, setOpen] = useState<string | null>(null);
  const byClaimer = useMemo(() => {
    const out = new Map<string, Claim[]>();
    for (const c of claims) out.set(claimerOf(c), [...(out.get(claimerOf(c)) ?? []), c]);
    return [...out];
  }, [claims]);
  const claimers = useClaimers(byClaimer.map(([account]) => account));
  return (
    <section
      ref={card}
      data-float=""
      data-b="box"
      data-kind="float"
      aria-label={mapClaimWords.title}
      className={`invisible ${place} top-0 left-0 flex w-tile-width max-w-full flex-col border border-primary bg-surface`}
    >
      {byClaimer.map(([account, theirs]) => {
        const who = claimers.get(account);
        return (
          <div key={account} className="flex flex-col">
            {/* who said it, first: their picture, their name, their account */}
            <div className="flex min-w-0 items-center gap-space-8 px-space-16 pt-space-8">
              <Avatar src={who?.avatar ?? null} size="icon" />
              {who?.name && <span className="truncate type-ui text-primary">{who.name}</span>}
              <Mono as="span" tone="muted">
                {account}
              </Mono>
            </div>
            <MapClaims
              groups={mapClaimGroups(theirs, names)}
              open={open}
              onOpen={(key) => setOpen((now) => (now === key ? null : key))}
              fold={KEEP_OPEN}
              bare
            />
          </div>
        );
      })}
    </section>
  );
}
