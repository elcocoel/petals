// node apps/web/scripts/lab-petal-data.ts: the petal look bench's one flower of its own (#76, /lab/petal). RaidGuild's
// RG delegates on Gnosis at block 49,181,976 (9 Nov 2026), the flower Elco's art direction was drawn on
// (design/flower-art-direction/raidguild-render-record.json): its snapshot, taken from the live site by its hash and
// checked, and the spec the site proposes for it. Written to fixtures/lab/, outside the store's lookup path, so the
// relations index and every other reader of fixtures/snapshots stay as they are. Read-only on the site; files
// already there are left alone.
//   node apps/web/scripts/lab-petal-data.ts [--site https://petal-flowers.vercel.app]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { Snapshot, Spec } from '@petal/core/types';
import { LAB_DIR, RAIDGUILD } from '../lab/petal/raidguild.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
const siteAt = args.indexOf('--site');
const site = siteAt >= 0 ? (args[siteAt + 1] as string) : 'https://petal-flowers.vercel.app';
const dir = join(root, LAB_DIR);
const snapshotFile = join(dir, `${RAIDGUILD.sha256}.json.gz`);
const specFile = join(dir, `${RAIDGUILD.sha256}.spec.json`);
const HEADERS = { 'user-agent': 'petals-lab-petal/1.0', 'content-type': 'application/json' };
mkdirSync(dir, { recursive: true });

if (!existsSync(snapshotFile)) {
  const res = await fetch(`${site}/api/v1/snapshots/${RAIDGUILD.sha256}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${site}: ${res.status}`);
  const s = (await res.json()) as Snapshot;
  const canonical = Buffer.from(canonicalJson(s), 'utf8');
  const sha256 = sha256Hex(canonical);
  if (sha256 !== RAIDGUILD.sha256)
    throw new Error(`the site sent ${sha256}, not ${RAIDGUILD.sha256}`);
  writeFileSync(snapshotFile, gzipSync(canonical, { level: 9 }));
  process.stdout.write(`${snapshotFile}: ${canonical.length} bytes\n`);
}

if (!existsSync(specFile)) {
  const res = await fetch(`${site}/api/v1/specs/propose`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(RAIDGUILD),
  });
  if (!res.ok) throw new Error(`${site}: ${res.status}`);
  const { spec } = (await res.json()) as { spec: Spec };
  if (spec.snapshot.sha256 !== RAIDGUILD.sha256) throw new Error('the spec names another snapshot');
  writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`);
  process.stdout.write(`${specFile}\n`);
}
