// The mapping waves' files onto the shared map (board #96; Elco, 11 Nov: "map it ourselves using the brain but
// at super speed"): each of Petals' formats in a folder (snapshot, proposals, mark, value, claim) checked
// against its own schema, a bad one refused with its reasons; a good reading kept and drawn, credited to Petals'
// own mapping; a good mark, value or proposals kept by its map's address unless one is kept there already
// (--replace puts the wave's instead); claims checked and held. Hidden maps stay hidden. Where the server runs:
//   container exec petals node /app/scripts/load-mapping.ts <folder> [--dry] [--replace] [--by mapping.petals.near]
import { parseArgs } from 'node:util';
import { createContext, loadMapping, serverConfig } from '@petal/agent';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { dry: { type: 'boolean' }, replace: { type: 'boolean' }, by: { type: 'string' } },
});
const folder = positionals[0];
if (!folder)
  throw new Error('usage: load-mapping.ts <folder> [--dry] [--replace] [--by <near account>]');
const ctx = createContext(serverConfig(process.env));
const r = await loadMapping(ctx, folder, {
  by: values.by ?? 'mapping.petals.near',
  ...(values.dry ? { dry: true } : {}),
  ...(values.replace ? { replace: true } : {}),
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
  `${r.files} files: ${r.evidence} evidence, ${r.refused.length} refused; ${per}; ${r.drawn} drawn${values.dry ? ' (--dry: nothing kept)' : ''}`,
);
