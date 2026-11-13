// Every map's mark (the chain first, then lists): each map on the shared map, its
// organisation's name, its token's symbol and its logo, each saying where it came from (mark/v1), kept by the
// map's address. It writes to the server's own store, so run it where the server runs:
//   container exec petals node /app/scripts/map-marks.ts [--dry] [--only <part of a map's address>]
// --dry reads and says, and keeps nothing. Read again, a map's mark is replaced.
// --types only adds each kept mark's types, keeping its name, symbol and logo as they are.
// --logos only adds a logo to each kept mark that has none, keeping the rest as it is.
import { parseArgs } from 'node:util';
import { createContext, logoMaps, markMaps, serverConfig, typeMaps } from '@petal/agent';

const { values } = parseArgs({
  options: {
    dry: { type: 'boolean' },
    only: { type: 'string' },
    types: { type: 'boolean' },
    logos: { type: 'boolean' },
  },
});
const ctx = createContext(serverConfig(process.env));
if (values.types) {
  const t = await typeMaps(ctx, {
    save: !values.dry,
    ...(values.only ? { only: values.only } : {}),
    log: (line) => console.log(line),
  });
  console.log(
    `${t.maps} maps: ${t.typed} kept marks with types, ${t.unmarked} with no mark kept; ${values.dry ? 'nothing kept (--dry)' : `${t.saved} kept`}`,
  );
  process.exit(0);
}
if (values.logos) {
  const l = await logoMaps(ctx, {
    save: !values.dry,
    ...(values.only ? { only: values.only } : {}),
    log: (line) => console.log(line),
  });
  console.log(
    `${l.maps} maps: ${l.without} showed no logo, ${l.found} given one; ${values.dry ? 'nothing kept (--dry)' : `${l.saved} kept`}${l.failed_lists.length ? `; lists not read: ${l.failed_lists.join(', ')}` : ''}`,
  );
  process.exit(0);
}
const r = await markMaps(ctx, {
  save: !values.dry,
  ...(values.only ? { only: values.only } : {}),
  log: (line) => console.log(line),
});
console.log(
  `${r.maps} maps: ${r.named} named, ${r.symbols} with a symbol, ${r.logos} with a logo; ${values.dry ? 'nothing kept (--dry)' : `${r.saved} kept`}${r.failed_lists.length ? `; lists not read: ${r.failed_lists.join(', ')}` : ''}`,
);
