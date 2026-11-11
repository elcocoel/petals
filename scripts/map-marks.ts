// Every map's mark (board #85; Elco's pick, 11 Nov: "Chain first, then lists"): each map on the shared map, its
// organisation's name, its token's symbol and its logo, each saying where it came from (mark/v1), kept by the
// map's address. It writes to the server's own store, so run it where the server runs:
//   container exec petals node /app/scripts/map-marks.ts [--dry] [--only <part of a map's address>]
// --dry reads and says, and keeps nothing. Read again, a map's mark is replaced.
import { parseArgs } from 'node:util';
import { createContext, markMaps, serverConfig } from '@petal/agent';

const { values } = parseArgs({
  options: { dry: { type: 'boolean' }, only: { type: 'string' } },
});
const ctx = createContext(serverConfig(process.env));
const r = await markMaps(ctx, {
  save: !values.dry,
  ...(values.only ? { only: values.only } : {}),
  log: (line) => console.log(line),
});
console.log(
  `${r.maps} maps: ${r.named} named, ${r.symbols} with a symbol, ${r.logos} with a logo; ${values.dry ? 'nothing kept (--dry)' : `${r.saved} kept`}${r.failed_lists.length ? `; lists not read: ${r.failed_lists.join(', ')}` : ''}`,
);
