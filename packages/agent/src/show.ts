// What an answer is about on the Power Map (the map is always there, and an answer moves it): the `show` event,
// read off what a tool answered, so it costs the model no turn, and the map takes it as it is. And the `next`
// event: after a map is read, the next steps on it (three next-step buttons that drive the map, the brain's
// services as one-press options).
import type { MapShow, NextSteps } from '@petal/core/types';
import { nextSteps } from '@petal/tools';

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' && x ? x : null);

/** What a tool's answer says the person is looking at on the map, or null when it says nothing. */
export function showOf(name: string, out: unknown): MapShow | null {
  if (!isObj(out)) return null;
  if (name === 'get_map') {
    const id = str(out.id);
    return id ? { map: id } : null;
  }
  if (name === 'find_voting_blocs' || name === 'list_payouts') {
    const id = str(out.about);
    return id ? { map: id } : null;
  }
  if (name !== 'look_up') return null;
  const maps = Array.isArray(out.maps) ? out.maps.filter(isObj) : [];
  const first = maps[0];
  const map = str(first?.id);
  if (!map) return null;
  // an account that sits in a reading as a holder is a wallet, lit wherever it sits; anything else, the map
  const accounts = Array.isArray(out.accounts) ? out.accounts.filter(isObj) : [];
  const wallet = str(accounts.find((a) => a.role === 'holder' || a.role === 'delegator')?.account);
  if (wallet) return { wallet, chain: str(first?.chain) };
  return { map };
}

/** A target's key, so the same thing is shown once in a turn. */
export const showKey = (s: MapShow) => JSON.stringify(s);

/** The next steps after get_map read a map, or null after any other tool. */
export function nextOf(name: string, out: unknown): NextSteps | null {
  if (name !== 'get_map' || !isObj(out)) return null;
  const id = str(out.id);
  const mapName = str(out.name);
  if (!id || !mapName) return null;
  return nextSteps({
    id,
    name: mapName,
    proposals: isObj(out.proposals) ? (out.proposals as { voted?: number }) : null,
    payouts: isObj(out.payouts) ? (out.payouts as { count?: number }) : null,
    value: isObj(out.value) ? (out.value as { treasury_usd?: string | null }) : null,
  });
}
