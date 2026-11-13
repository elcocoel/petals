// Every DAO map's voting blocs over a period, said (nothing is kept as Petals' mapping's claims: the site and
// agents compute them live): how many pairs and blocs each map has. It reads the
// server's own store, so run it where the server runs:
//   container exec petals node /app/scripts/map-blocs.ts [--from <ISO time>] [--to <ISO time>]
//     [--min-shared <n>] [--min-agreement <0 to 1>] [--min-kappa <-1 to 1>] [--only <part of a map's address>]
// With no period, every proposal read.
import { parseArgs } from 'node:util';
import { blocMaps, createContext, serverConfig } from '@petal/agent';

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    'min-shared': { type: 'string' },
    'min-agreement': { type: 'string' },
    'min-kappa': { type: 'string' },
    only: { type: 'string' },
  },
});
const ctx = createContext(serverConfig(process.env));
const r = await blocMaps(ctx, {
  ...(values.from ? { from: new Date(values.from).toISOString() } : {}),
  ...(values.to ? { to: new Date(values.to).toISOString() } : {}),
  ...(values['min-shared'] ? { min_shared: Number(values['min-shared']) } : {}),
  ...(values['min-agreement'] ? { min_agreement: Number(values['min-agreement']) } : {}),
  ...(values['min-kappa'] ? { min_kappa: Number(values['min-kappa']) } : {}),
  ...(values.only ? { only: values.only } : {}),
  log: (line) => console.log(line),
});
console.log(`${r.maps} DAO maps: ${r.pairs} pairs in ${r.blocs} blocs; nothing kept`);
