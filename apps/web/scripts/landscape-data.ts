// node apps/web/scripts/landscape-data.ts: the map bench's copy of the night's data (specs/006-the-map, plan). Reads
// the run's index (../research/mapping-run-2026-11-09/INDEX.md, or the path given), and for each saved
// view takes its spec from its /d/ link and its reading from /api/v1/render, then every pair of groups
// that share accounts from /api/v1/relations/overview. Read-only. The server allows 60 calls a minute,
// so calls are a little over a second apart, and a view already in the fixture is never fetched again:
// its spec is content-addressed, so its reading can't change.
//   node apps/web/scripts/landscape-data.ts [index.md] [--site https://petal-flowers.vercel.app]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Night, NightGroup, NightPair, NightView } from '../landscape/night.ts';
import { NIGHT_FIXTURE } from '../landscape/night.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
const siteAt = args.indexOf('--site');
const site = siteAt >= 0 ? (args[siteAt + 1] as string) : 'https://petal-flowers.vercel.app';
const indexPath =
  args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--site') ??
  join(root, '../research/mapping-run-2026-11-09/INDEX.md');
const out = join(root, NIGHT_FIXTURE);
const say = (line: string) => process.stdout.write(`${line}\n`);
const HEADERS = { 'user-agent': 'petals-lab-map/1.0' };

let last = 0;
async function paced(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { ...init, headers: { ...HEADERS, ...init?.headers } });
    if (res.status !== 429) return res;
    const after = Number(res.headers.get('retry-after') ?? 10);
    await new Promise((r) => setTimeout(r, after * 1000));
  }
  throw new Error(`${url}: still rate limited`);
}

type Row = Omit<NightView, 'snapshot' | 'reading'>;

function rowsOf(index: string): Row[] {
  const rows: Row[] = [];
  for (const line of index.split('\n')) {
    const m = /\/d\/([0-9a-f]{64})/.exec(line);
    if (!line.startsWith('|') || !m) continue;
    const c = line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((s) => s.trim());
    rows.push({
      sha: m[1] as string,
      name: c[0] ?? '',
      chain: c[1] ?? '',
      address: c[2] ?? '',
      reader: c[3] ?? '',
      count: c[4] ?? '',
      status: c[6] ?? '',
      as_of: c[7] ?? '',
    });
  }
  return rows;
}

async function viewOf(row: Row): Promise<NightView> {
  const d = await paced(`${site}/d/${row.sha}`, { redirect: 'manual' });
  const to = d.headers.get('location');
  const param = to ? new URL(to, site).searchParams.get('spec') : null;
  if (!param) throw new Error(`/d/${row.sha}: no spec (HTTP ${d.status})`);
  const spec = JSON.parse(Buffer.from(param, 'base64url').toString('utf8'));
  const res = await paced(`${site}/api/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ spec, include_reading: true }),
  });
  const json = (await res.json()) as {
    reading?: NightView['reading'];
    error?: { message: string };
  };
  if (!res.ok || !json.reading)
    throw new Error(`render ${row.sha}: ${json.error?.message ?? res.status}`);
  return { ...row, snapshot: spec.snapshot.sha256, reading: json.reading };
}

const before: Night | null = existsSync(out)
  ? (JSON.parse(gunzipSync(readFileSync(out)).toString('utf8')) as Night)
  : null;
const kept = new Map((before?.views ?? []).map((v) => [v.sha, v]));
const rows = rowsOf(readFileSync(indexPath, 'utf8'));
const views: NightView[] = [];
let fetched = 0;
for (const row of rows) {
  const had = kept.get(row.sha);
  if (had) {
    views.push(had);
    continue;
  }
  views.push(await viewOf(row));
  fetched++;
}

const res = await paced(`${site}/api/v1/relations/overview?kind=holdings&limit=5000`);
const overview = (await res.json()) as {
  groups: (NightGroup & Record<string, unknown>)[];
  pairs: (NightPair & Record<string, unknown>)[];
  pairs_total: number;
};
if (overview.pairs.length < overview.pairs_total)
  say(`only ${overview.pairs.length} of ${overview.pairs_total} pairs came back`);

const night: Night = {
  made: new Date().toISOString(),
  source: site,
  run: 'research/mapping-run-2026-11-09/INDEX.md',
  views,
  groups: overview.groups.map((g) => ({
    id: g.id,
    chain: g.chain,
    snapshot_sha256: g.snapshot_sha256,
    members_total: g.members_total,
    title: g.title,
  })),
  pairs: overview.pairs.map((p) => ({
    a: p.a,
    b: p.b,
    shared: p.shared,
    weight: p.weight,
    match: p.match,
  })),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gzipSync(JSON.stringify(night), { level: 9 }));
say(
  `${views.length} views (${fetched} fetched, ${views.length - fetched} kept), ${night.groups.length} groups, ${night.pairs.length} pairs -> ${NIGHT_FIXTURE}`,
);
