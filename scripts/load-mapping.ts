// A mapping run's files onto the shared map (Petals maps it itself, with the brain): each of Petals' formats
// in a folder (snapshot, proposals, mark, value, claim, vesting) checked
// against its own schema, a bad one refused with its reasons; a good reading kept and drawn, credited to Petals'
// own mapping; a good mark, value, proposals or vesting kept by its map's address unless one is kept there already
// (--replace puts the run's instead); claims checked as published and kept as Petals' mapping's. Hidden maps stay hidden. Where the server runs:
//   container exec petals node /app/scripts/load-mapping.ts <folder> [--dry] [--replace] [--by mapping.petals.near]
//     [--manifest <a run's manifest outside the folder: L2-IMPORT-MANIFEST.json, phase2-ethereum-manifest.json>]
// A run's manifest says which files load (and the canonical sha256 each must have); unlisted ones are held.
import { parseArgs } from 'node:util';
import { createContext, loadMapping, serverConfig } from '@petal/agent';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dry: { type: 'boolean' },
    replace: { type: 'boolean' },
    by: { type: 'string' },
    manifest: { type: 'string', multiple: true },
  },
});
const folder = positionals[0];
if (!folder)
  throw new Error('usage: load-mapping.ts <folder> [--dry] [--replace] [--by <near account>]');
const ctx = createContext(serverConfig(process.env));
const r = await loadMapping(ctx, folder, {
  by: values.by ?? 'mapping.petals.near',
  ...(values.dry ? { dry: true } : {}),
  ...(values.replace ? { replace: true } : {}),
  ...(values.manifest?.length ? { manifests: values.manifest } : {}),
  log: (line) => console.log(line),
});
for (const x of r.refused) console.log(`refused ${x.file}: ${x.why.join('; ')}`);
const per = Object.entries(r.formats)
  .map(
    ([f, t]) =>
      `${f} ${t.good} good, ${t.kept} kept${t.left ? `, ${t.left} left (one already kept)` : ''}`,
  )
  .join('; ');
console.log(
  `${r.files} files: ${r.evidence} evidence, ${r.held} held by their manifest, ${r.refused.length} refused; ${per}; ${r.drawn} drawn${values.dry ? ' (--dry: nothing kept)' : ''}`,
);
