// The skeleton's fixture flower: the recorded skeleton run as a hero entry (flower/v1, maker null)
// in fixtures/map/, so the gallery shows a "fixture" flower from a clean clone (quickstart step 1,
// SC-009). A stand-in until the hero set (T115) replaces it. It is made the way T115 makes heroes:
// by Petal's agent (here the recorded run), figures from the tools only.
//
//   node tests/e2e/skeleton-entry.ts          print the entry
//   node tests/e2e/skeleton-entry.ts --write  write fixtures/map/<id>.json (and drop an older one)
//
// The committed file is what the gallery shows as a "fixture", never as "on NEAR".
// skeleton.test.ts checks it is what this makes from the current code.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { petalApp } from '@petal/agent';
import { entryId } from '@petal/core';
import type { Entry, FlowerResult } from '@petal/core/types';
import { entryDraft, REPO, readSse } from './helpers.ts';

export const SKELETON_TITLE = 'Who stands behind NEAR’s validators?';
export const MAP_FIXTURES = join(REPO, 'fixtures/map');

/** The fixture entry for a skeleton flower: no maker, dated by its snapshot, so it is stable. */
export function skeletonEntry(flower: FlowerResult): Entry {
  const draft = entryDraft(flower, {
    title: SKELETON_TITLE,
    model: 'recorded',
    signature: null,
    created_at: flower.spec.snapshot.as_of,
  });
  const unsigned: Omit<Entry, 'id'> = {
    ...draft,
    provenance: { ...draft.provenance, maker: null },
  };
  return { ...unsigned, id: entryId(unsigned) };
}

/** Replays the recorded skeleton run on petalApp in fake mode and returns its flower. */
export async function skeletonFlower(): Promise<FlowerResult> {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-skeleton-entry-'));
  try {
    const app = petalApp({ root: REPO, fake: true, stateDir });
    const sent = Date.now();
    const res = await app.request('/api/v1/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'who stands behind NEAR’s validators?' }],
      }),
    });
    const flower = (await readSse(res, sent)).find((e) => e.event === 'flower');
    if (!flower) throw new Error('skeleton-entry: the recorded run made no flower');
    return flower.data as FlowerResult;
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

/** The skeleton entries now in fixtures/map/ (by title). */
export function committedSkeletonEntries(): { file: string; entry: Entry }[] {
  let names: string[] = [];
  try {
    names = readdirSync(MAP_FIXTURES).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names
    .map((n) => ({
      file: join(MAP_FIXTURES, n),
      entry: JSON.parse(readFileSync(join(MAP_FIXTURES, n), 'utf8')) as Entry,
    }))
    .filter((x) => x.entry.title === SKELETON_TITLE);
}

export const fileText = (e: Entry) => `${JSON.stringify(e, null, 2)}\n`;

if (import.meta.main) {
  const entry = skeletonEntry(await skeletonFlower());
  if (process.argv.includes('--write')) {
    for (const old of committedSkeletonEntries()) rmSync(old.file);
    const file = join(MAP_FIXTURES, `${entry.id}.json`);
    writeFileSync(file, fileText(entry));
    process.stderr.write(`wrote ${file}\n`);
  } else {
    process.stdout.write(fileText(entry));
  }
}
