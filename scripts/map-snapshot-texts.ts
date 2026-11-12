// The Snapshot proposals on the shared map given their own text and their page on Snapshot (proposals/v3; Elco,
// 12 Nov, walk 3: "there's no way for me to know what this proposal is about so maybe there's a link to wherever
// it was made maybe there is a summary"), by each proposal's id from Snapshot's keyless GraphQL. Only summary and
// link are added; everything else in each doc stays. It writes to the server's own store, so run it where the
// server runs:
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
