// The Snapshot proposals on the shared map given their own text and their page on Snapshot (proposals/v3: so a
// reader can tell what a proposal is about, with a summary and a link to where it was made), by each proposal's
// id from Snapshot's keyless GraphQL. Only summary and link are added; everything else in each doc stays. It
// writes to the server's own store, so run it where the server runs:
//   container exec petals node /app/scripts/map-snapshot-texts.ts [--dry] [--only <part of a map's address>]
import { parseArgs } from 'node:util';
import { createContext, serverConfig, snapshotTexts } from '@petal/agent';

const { values } = parseArgs({ options: { dry: { type: 'boolean' }, only: { type: 'string' } } });
const ctx = createContext(serverConfig(process.env));
const r = await snapshotTexts(ctx, {
  save: !values.dry,
  ...(values.only ? { only: values.only } : {}),
  log: (line) => console.log(line),
});
console.log(
  `${r.docs} maps with Snapshot proposals: ${r.found} of ${r.proposals} given their text and page; ${values.dry ? 'nothing kept (--dry)' : `${r.saved} kept`}${r.failed.length ? `; not answered: ${r.failed.join('; ')}` : ''}`,
);
