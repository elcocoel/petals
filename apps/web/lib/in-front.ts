// What is in front of the person on /make's canvas, sent with every turn (ChatInput.in_front), so "this" in a
// question means what they are looking at: the map they're inside on the Power Map (or the whole map), the
// conversation's flower when it's drawn apart from the map, the layers switched on where some are off, and what's
// chosen (a wallet, a pinned proposal). The server checks it and writes it into the model's notes.
import type { InFront, MapShow } from '@petal/core/types';

export type { InFront };

export interface CanvasFront {
  /** the Power Map is the ground (else the conversation's flower is drawn on its own) */
  onMap: boolean;
  /** the map the canvas says the person is inside, or null */
  entered: string | null;
  /** the flower drawn apart from the map, by its spec_sha256 */
  flower: string | null;
  /** the map's layers still on, by the map they belong to; null when all are on */
  layers: { map: string; on: readonly string[] } | null;
  /** a wallet chosen on the map, by its id on its chain */
  wallet: { id: string; chain: string } | null;
  /** a proposal pinned on the map's ring */
  proposal: { map: string; id: string } | null;
}

/** The in_front of a turn, from what the canvas has open. */
export function inFrontOf(c: CanvasFront): InFront {
  if (!c.onMap) return c.flower ? { map: null, flower: c.flower } : { map: null };
  const map = c.entered;
  const selected: MapShow | null = c.wallet
    ? { wallet: c.wallet.id, chain: c.wallet.chain }
    : c.proposal && c.proposal.map === map
      ? { proposal: { map: c.proposal.map, id: c.proposal.id } }
      : null;
  return {
    map,
    ...(map && c.layers && c.layers.map === map ? { layers: [...c.layers.on] } : {}),
    ...(selected ? { selected } : {}),
  };
}
