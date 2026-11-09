// What a person would see, read through a running server's HTTP API with their session:
// their account and linked wallets, their explorations with steps and notes, their follows and notes,
// and whether the reading they posted is still served. Writes <out file> as JSON.
//   node read.ts <base url> <seed.json> <out file>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const [base, seedFile, outFile] = process.argv.slice(2) as [string, string, string];
const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
const get = async (path: string) => {
  const res = await fetch(`${base}${path}`, { headers: { cookie: seed.session } });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
};

const me = await get('/api/v1/me');
const list = await get('/api/v1/explorations');
const explorations: Record<string, unknown> = {};
for (const id of seed.explorations as string[]) explorations[id] = await get(`/api/v1/explorations/${id}`);
const follows = await get('/api/v1/follows');
const notes = await get('/api/v1/notes');
const snap = await fetch(`${base}/api/v1/snapshots/${seed.posted_snapshot}`);
const raw = Buffer.from(await snap.arrayBuffer());
// a gzip body whose header was dropped on the way: undo it here, and say so
const gz = raw[0] === 0x1f && raw[1] === 0x8b;
const snapText = (gz ? gunzipSync(raw) : raw).toString('utf8');
const out = {
  me,
  explorations_list: list,
  explorations,
  follows,
  notes,
  posted_snapshot: {
    status: snap.status,
    arrived_gzipped_without_header: gz,
    sha256_of_body_matches: snap.ok
      ? (await import(`${process.env.REPO}/packages/core/src/index.ts`)).sha256Hex(
          (await import(`${process.env.REPO}/packages/core/src/index.ts`)).canonicalJson(JSON.parse(snapText)),
        ) === seed.posted_snapshot
      : false,
  },
};
const text = `${JSON.stringify(out, null, 2)}\n`;
writeFileSync(outFile, text);
const m = me.body as { person_id?: string; wallets?: { caip10: string }[] };
const steps = Object.values(explorations).map((e) => ((e as { body: { steps?: unknown[] } }).body.steps ?? []).length);
console.log(
  `${base}: me ${me.status}, person ${m.person_id ?? '-'}, wallets [${(m.wallets ?? []).map((w) => w.caip10).join(', ')}], ` +
    `explorations ${(list.body as { explorations?: unknown[] }).explorations?.length ?? '-'} (steps ${steps.join('+')}), ` +
    `follows ${(follows.body as { follows?: unknown[] }).follows?.length ?? '-'}, notes ${(notes.body as { notes?: unknown[] }).notes?.length ?? '-'}, ` +
    `posted reading ${out.posted_snapshot.status}${out.posted_snapshot.sha256_of_body_matches ? ' (hash matches)' : ''}; ` +
    `answers sha256 ${createHash('sha256').update(text).digest('hex').slice(0, 16)}`,
);
