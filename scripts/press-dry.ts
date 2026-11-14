// What one press over every map would publish for an author, before anyone signs (composition.md, section 2b):
// each map's version (its layers, parent and previous) and the maps left out, and how long preparing took. It
// keeps nothing: no nonce, no draft, nothing appended. For Petals' base data, the author is petals.near, whose
// versions follow each map's imported entry. Where the server runs:
//   container exec petals node /app/scripts/press-dry.ts [--author near:mainnet:petals.near]
import { parseArgs } from 'node:util';
// through @petal/agent, as the other scripts: /app/scripts resolves no other workspace package in the container
import { createContext, preparePress, serverConfig } from '@petal/agent';

const { values } = parseArgs({
  options: { author: { type: 'string', default: 'near:mainnet:petals.near' } },
});
const author = values.author as string;
const ctx = createContext(serverConfig(process.env));
const t0 = Date.now();
// nobody's own kept data: what the author holds as an author (Petals' holdings, for petals.near)
const r = await preparePress(ctx, { owner: 'press-dry', authors: [author] }, 'all', author, 'dry', {
  dry: true,
});
const ms = Date.now() - t0;
let signsAsIs = 0;
for (const p of r.publications) {
  const v = p.publication;
  if (v.parent === v.previous) signsAsIs++;
  console.log(
    `${v.about}: ${v.layers.length} layers, parent ${v.parent?.slice(0, 12) ?? 'none'}, previous ${v.previous?.slice(0, 12) ?? 'none'}`,
  );
}
for (const l of r.left) console.log(`left ${l.about}: ${l.why}`);
console.log(r.text ?? 'nothing to press');
console.log(
  `${r.publications.length} versions in one press (${signsAsIs} with parent and previous the same entry), ${r.left.length} maps left; prepared in ${ms} ms (--dry: nothing kept)`,
);
