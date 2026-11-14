// Every map's mark (the chain first, then lists): each map on the shared map, its
// organisation's name, its token's symbol and its logo, each saying where it came from (mark/v1), kept by the
// map's address. It writes to the server's own store, so run it where the server runs:
//   container exec petals node /app/scripts/map-marks.ts [--dry] [--only <part of a map's address>]
// --dry reads and says, and keeps nothing. Read again, a map's mark is replaced.
// --types only adds each kept mark's types, keeping its name, symbol and logo as they are.
// --logos only adds a logo to each kept mark that has none, keeping the rest as it is.
// --logos-from <file.csv> adds the logos a mapping run checked (columns map_id, image_url, branding_scope,
//   source_url, logo_status; rows whose logo_status is 'found; pending import'), the same way: only to a kept
//   mark with no logo, its picture in media.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  createContext,
  type GivenLogo,
  logoMaps,
  logosGiven,
  markMaps,
  serverConfig,
  typeMaps,
} from '@petal/agent';

const { values } = parseArgs({
  options: {
    dry: { type: 'boolean' },
    only: { type: 'string' },
    types: { type: 'boolean' },
    logos: { type: 'boolean' },
    'logos-from': { type: 'string' },
  },
});
const ctx = createContext(serverConfig(process.env));

/** RFC 4180 rows: quoted fields may hold commas, quotes doubled and line breaks. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((x) => x !== ''));
}

/** How the run knew each logo, as mark/v2's logo says it: who declares it, and where from. */
const KNOWN: Record<string, Pick<GivenLogo, 'status' | 'source'>> = {
  'bound to exact map account': { status: 'self-declared', source: 'website' },
  'self-declared source': { status: 'self-declared', source: 'website' },
  'DAO-declared website icon': { status: 'self-declared', source: 'website' },
  'DAO-declared social profile': { status: 'self-declared', source: 'social' },
  'DAO get_config declaration': { status: 'self-declared', source: 'chain' },
  'curated registry matches exact token address': { status: 'verified', source: 'registry' },
};

if (values['logos-from']) {
  const [head, ...body] = csvRows(readFileSync(values['logos-from'], 'utf8'));
  const col = (name: string) => (head ?? []).indexOf(name);
  const [id, url, scope, status] = ['map_id', 'image_url', 'branding_scope', 'logo_status'].map(
    col,
  );
  const given: GivenLogo[] = [];
  for (const r of body) {
    if (r[status as number] !== 'found; pending import') continue;
    const known = KNOWN[r[scope as number] ?? ''];
    const about = r[id as number] ?? '';
    const at = r[url as number] ?? '';
    if (!known || !about || !at) {
      console.log(`${about || '(no map)'}: left, not one the run found and checked`);
      continue;
    }
    if (values.only && !about.includes(values.only)) continue;
    given.push({ about, url: at, ...known });
  }
  const g = await logosGiven(ctx, given, { save: !values.dry, log: (line) => console.log(line) });
  console.log(
    `${g.given} logos given: ${g.left.length} left as they were; ${values.dry ? 'nothing kept (--dry)' : `${g.saved} kept`}`,
  );
  process.exit(0);
}
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
