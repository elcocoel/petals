// The night's views get their names and their maker on the map, from the bench's copy of the run's index.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { run } from '../label-map-views.ts';

describe('label-map-views', () => {
  test('names the views this server holds, says who made them, and says how many it lacks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-label-'));
    const store = openStore(join(dir, 'private.db'));
    await store.draft.put({
      sha256: 'a'.repeat(64),
      body: '{}',
      created_at: '2026-11-09T01:00:00.000Z',
    });
    await store.close();
    const copy = join(dir, 'copy.json.gz');
    writeFileSync(
      copy,
      gzipSync(
        JSON.stringify({
          views: [
            { sha: 'a'.repeat(64), name: 'RaidGuild v3' },
            { sha: 'b'.repeat(64), name: 'Not here' },
          ],
        }),
      ),
    );
    const env = { PETAL_STATE_DIR: dir };
    const out = await run(['--by', 'mapping.petals.near', '--from', copy], env);
    expect(out).toMatch(/named 1 of 2 views, made by mapping\.petals\.near/);
    expect(out).toMatch(/not on this server: 1/);
    const again = openStore(join(dir, 'private.db'));
    expect(await again.draft.get('a'.repeat(64))).toMatchObject({
      name: 'RaidGuild v3',
      made_by: 'mapping.petals.near',
    });
    await again.close();
    expect(await run(['--by', 'mapping.petals.near', '--from', copy], env)).toMatch(/named 1 of 2/);
    await expect(run(['--by', 'Not An Account'], env)).rejects.toThrow(/usage/);
  });

  test('the copy in the repo holds the 203 views the run saved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-label-'));
    openStore(join(dir, 'private.db')).close();
    expect(await run(['--by', 'mapping.petals.near'], { PETAL_STATE_DIR: dir })).toMatch(
      /named 0 of 203 views/,
    );
  });
});
