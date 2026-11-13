// What was on the map before the publication record enters it once (wave 8; specs/005-mapping-brain/composition.md,
// section 2): per map, Petals' own rows as one "imported, unsigned" publication by mapping.petals.near, and each
// press signed before the protocol as its author's, with its proof. A map already in the record is left. Where the
// server runs:
//   container exec petals node /app/scripts/publish-import.ts [--dry]
import { parseArgs } from 'node:util';
import { createContext, serverConfig } from '@petal/agent';
import { importRecord } from '@petal/tools';

const { values } = parseArgs({ options: { dry: { type: 'boolean' } } });
const ctx = createContext(serverConfig(process.env));
const r = await importRecord(ctx, values.dry ? { dry: true } : {});
for (const p of r.publications)
  console.log(
    `${values.dry ? 'would append' : 'appended'} ${p.about} by ${p.author}${p.signed ? ' (signed)' : ' (imported, unsigned)'}: ${Object.entries(
      p.layers,
    )
      .map(([k, n]) => `${n} ${k}`)
      .join(', ')}`,
  );
const layers = r.publications.reduce(
  (n, p) => n + Object.values(p.layers).reduce((a, b) => a + b, 0),
  0,
);
console.log(
  `${r.maps} maps: ${r.publications.length} publications, ${layers} layers; ${r.left.length} already in the record${values.dry ? ' (--dry: nothing appended)' : ''}`,
);
