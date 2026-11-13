// What each map's token is worth (monetary estimates of its petals, its stakes and its supply): each map on
// the shared map, its token's price from NEAR Intents' 1Click list, its supply from its chain and its newest
// reading's totals at that price, kept as value/v3 by the map's address, with its circulating supply, max and market cap (the chain's max first, else CoinGecko's)
// and its treasury (one the chain gave stays; else DefiLlama's). A token nothing prices says no price.
// It writes to the server's own store, so run it
// where the server runs:
//   container exec petals node /app/scripts/map-values.ts [--dry] [--only <part of a map's address>]
// --dry reads and says, and keeps nothing. Read again, a map's value is replaced.
import { parseArgs } from 'node:util';
import { createContext, serverConfig, valueMaps } from '@petal/agent';

const { values } = parseArgs({
  options: { dry: { type: 'boolean' }, only: { type: 'string' } },
});
const ctx = createContext(serverConfig(process.env));
const r = await valueMaps(ctx, {
  save: !values.dry,
  ...(values.only ? { only: values.only } : {}),
  log: (line) => console.log(line),
});
console.log(
  `${r.maps} maps: ${r.priced} priced, ${r.supplied} with a supply, ${r.circulating} circulating, ${r.maxed} with a max, ${r.treasuries} with a treasury; ${values.dry ? 'nothing kept (--dry)' : `${r.saved} kept`}${r.failed_lists.length ? `; not read: ${r.failed_lists.join(', ')}` : ''}`,
);
