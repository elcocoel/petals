// A DAO's proposals and how each account voted on each: each DAO map on the shared map that Petals
// reads proposals for (a Sputnik DAO, and a token map whose token is a Baal's shares), its proposals/v1, kept by the map's address. With --add-sputnik,
// it first draws that DAO's map and names it, so it's on the shared map. It writes to the server's own store,
// so run it where the server runs:
//   container exec petals node /app/scripts/map-proposals.ts [--dry] [--only <part of an address>]
//     [--add-sputnik <dao>.sputnik-dao.near --name "<name>" --by mapping.petals.near]
// --dry reads and says, and keeps nothing. Read again, a map's proposals are replaced.
import { parseArgs } from 'node:util';
import { addDaoMap, createContext, proposalMaps, serverConfig } from '@petal/agent';

const { values } = parseArgs({
  options: {
    dry: { type: 'boolean' },
    only: { type: 'string' },
    'add-sputnik': { type: 'string' },
    name: { type: 'string' },
    by: { type: 'string' },
  },
});
const ctx = createContext(serverConfig(process.env));
const dao = values['add-sputnik'];
if (dao) {
  if (!values.name || !values.by) throw new Error('--add-sputnik needs --name and --by');
  const added = await addDaoMap(ctx, {
    network: 'sputnik-dao',
    params: { dao },
    name: values.name,
    by: values.by,
  });
  console.log(
    `drew ${dao}: snapshot ${added.snapshot}, flower ${added.spec}, named "${values.name}" by ${values.by}`,
  );
}
const r = await proposalMaps(ctx, {
  save: !values.dry,
  ...(values.only ? { only: values.only } : dao ? { only: dao } : {}),
  log: (line) => console.log(line),
});
console.log(
  `${r.maps} DAO maps: ${r.proposals} proposals, ${r.votes} votes; ${values.dry ? 'nothing kept (--dry)' : `${r.saved} kept`}`,
);
