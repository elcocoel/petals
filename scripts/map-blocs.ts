// Every DAO map's voting blocs, kept as Petals' own mapping's claims (board #94; META, 11 Nov: run by hand per
// period, never on a timer): each pair of accounts that voted on enough of the same proposals and alike on enough
// of them, as an inferred claim (moves_with) with its proposals as evidence, shown through
// GET /api/v1/maps/:id/claims. It writes to the server's own store, so run it where the server runs:
//   container exec petals node /app/scripts/map-blocs.ts [--dry] [--from <ISO time>] [--to <ISO time>]
//     [--min-shared <n>] [--min-agreement <0 to 1>] [--only <part of a map's address>]
// With no period, every proposal read. --dry finds and says, and keeps nothing.
import { parseArgs } from 'node:util';
import { blocMaps, createContext, serverConfig } from '@petal/agent';

const { values } = parseArgs({
  options: {
    dry: { type: 'boolean' },
    from: { type: 'string' },
    to: { type: 'string' },
    'min-shared': { type: 'string' },
    'min-agreement': { type: 'string' },
    only: { type: 'string' },
  },
});
const ctx = createContext(serverConfig(process.env));
const r = await blocMaps(ctx, {
  save: !values.dry,
  ...(values.from ? { from: new Date(values.from).toISOString() } : {}),
  ...(values.to ? { to: new Date(values.to).toISOString() } : {}),
  ...(values['min-shared'] ? { min_shared: Number(values['min-shared']) } : {}),
  ...(values['min-agreement'] ? { min_agreement: Number(values['min-agreement']) } : {}),
  ...(values.only ? { only: values.only } : {}),
  log: (line) => console.log(line),
});
console.log(
  `${r.maps} DAO maps: ${r.pairs} pairs in ${r.blocs} blocs; ${values.dry ? 'nothing kept (--dry)' : `${r.kept} claims kept`}`,
);
