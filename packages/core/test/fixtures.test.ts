// Every snapshot fixture is schema-valid, and content-addressed ones are named by their hash.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { canonicalJson, sha256Hex } from '../src/hash.ts';
import { createAjv, schemaId } from '../src/schema/ajv.ts';

const fixtures = join(import.meta.dirname, '..', '..', '..', 'fixtures');
const list = (dir: string, suffix: string) =>
  existsSync(join(fixtures, dir))
    ? readdirSync(join(fixtures, dir))
        .filter((f) => f.endsWith(suffix))
        .map((f) => `${dir}/${f}`)
    : [];
const read = (file: string) => {
  const bytes = readFileSync(join(fixtures, file));
  return JSON.parse((file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8'));
};

const stored = list('snapshots', '.json.gz');
const all = [...stored, ...list('snapshots/test', '.json'), ...list('golden/inputs', '.json.gz')];
const validate = createAjv().getSchema(schemaId('snapshot'));

describe('snapshot fixtures', () => {
  test('there are some', () => {
    expect(stored.length).toBeGreaterThan(0);
  });

  test.each(all)('%s is snapshot/v1', (file) => {
    const ok = validate?.(read(file));
    expect(validate?.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  test.each(stored)('%s is named by its SHA-256', (file) => {
    expect(`snapshots/${sha256Hex(canonicalJson(read(file)))}.json.gz`).toBe(file);
  });
});
