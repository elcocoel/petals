// What each DAO map paid out (payouts/v1: an unopinionated "payouts from this treasury over period x"; NEAR
// first): each map of a Sputnik DAO on the shared map, every passed proposal's payment, dated
// by the DAO's own transfer in the transaction that approved it (FastNEAR's keyless transactions API) and
// priced that day (DefiLlama's past prices), kept by the map's address. It writes to the server's own store,
// so run it where the server runs:
//   container exec petals node /app/scripts/map-payouts.ts [--dry] [--only <part of a map's address>]
// --dry reads and says, and keeps nothing. Read again, a map's payouts are replaced.
import { parseArgs } from 'node:util';
import { createContext, payoutMaps, serverConfig } from '@petal/agent';

const { values } = parseArgs({
  options: { dry: { type: 'boolean' }, only: { type: 'string' } },
});
const ctx = createContext(serverConfig(process.env));
const r = await payoutMaps(ctx, {
  save: !values.dry,
  ...(values.only ? { only: values.only } : {}),
  log: (line) => console.log(line),
});
console.log(
  `${r.maps} maps: ${r.payouts} payouts, ${r.dated} dated, ${r.priced} priced; ${values.dry ? 'nothing kept (--dry)' : `${r.saved} kept`}${r.failed.length ? `; not answered: ${r.failed.length} (${r.failed.slice(0, 3).join('; ')})` : ''}`,
);
