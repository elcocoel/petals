// Petals' formats on the person's computer (#98): validate_data checks any document Petals keeps with core's
// own checks and writes nothing; keep_snapshot keeps a reading an agent made, here and in the project.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { Tool, ToolContext } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { validateData } from '../src/formats.ts';
import { LEFT_OUT, SITE_TOOLS, siteDoor } from '../src/site.ts';

const FIXTURES = join(import.meta.dirname, '../../../packages/core/schema/fixtures');
const fixture = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'));
const SITE = 'https://petals.example';
const LINK = `${SITE}/s/${'A'.repeat(43)}`;

describe('validate_data', () => {
  test('a valid document of each format passes, named by its hash', () => {
    for (const f of [
      'snapshot.v1.json',
      'layer.v1.json',
      'claim.v4.json',
      'mark.v2.json',
      'proposals.v1.json',
      'value.v1.json',
    ]) {
      const out = validateData(fixture(f));
      expect(out, f).toMatchObject({ ok: true, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    }
    const snap = fixture('snapshot.v1.json');
    expect(validateData(snap).sha256).toBe(
      sha256Hex(new TextEncoder().encode(canonicalJson(snap))),
    );
  });

  test("a claim the schema takes but Petals doesn't says why, as Petals would", () => {
    const claim = fixture('claim.v3.json');
    const inferred = { ...claim, kind: 'inferred', method: 'agent/codex@1', qualifiers: {} };
    const out = validateData(inferred) as { ok: boolean; errors: { message: string }[] };
    expect(out.ok).toBe(false);
    expect(out.errors.map((e) => e.message)).toContain('an inferred claim states its grounds');
  });

  test('a seam, an unknown format and a non-document each say what to do', () => {
    expect(JSON.stringify(validateData(fixture('seam.v1.json')))).toContain('made by compose_view');
    expect(JSON.stringify(validateData({ petal: 'recipe/v9' }))).toContain(
      "There's no check here for recipe/v9",
    );
    expect(JSON.stringify(validateData({ hello: 1 }))).toContain('petal names the format');
  });
});

describe('keep_snapshot', () => {
  const run = async (input: object, put: unknown[]) => {
    const seen: string[] = [];
    const fetch = async (url: string, init: RequestInit = {}) => {
      seen.push(`${init.method ?? 'GET'} ${url.slice(SITE.length)}`);
      if ((init.method ?? 'GET') === 'HEAD') return new Response(null, { status: 404 });
      return new Response(JSON.stringify({ stored: true }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const tool = (n: string) => ({
      name: n,
      input: { type: 'object' },
      output: { type: 'object' },
      run: async () => ({}),
    });
    const tools = siteDoor({ site: SITE, fetch }).tools(
      [...SITE_TOOLS, ...LEFT_OUT].map(tool) as unknown as Tool<unknown, unknown>[],
    );
    const keep = tools.find((t) => t.name === 'keep_snapshot') as Tool<unknown, unknown>;
    const stored = new Map<string, unknown>();
    const ctx = {
      config: { root: '/nowhere' },
      store: {
        put: async (s: unknown) => {
          put.push(s);
          stored.set(sha256Hex(new TextEncoder().encode(canonicalJson(s))), s);
        },
        gz: async () => null,
        get: async (sha: string) => stored.get(sha) ?? null,
      },
    } as unknown as ToolContext;
    return { out: (await keep.run(input, ctx)) as Record<string, unknown>, seen };
  };

  test('a valid one is kept here and put in the project it names, by its hash', async () => {
    const snap = fixture('snapshot.v1.json');
    const sha = sha256Hex(new TextEncoder().encode(canonicalJson(snap)));
    const put: unknown[] = [];
    const { out, seen } = await run({ snapshot: snap, exploration: LINK }, put);
    expect(out).toMatchObject({ sha256: sha, exploration: LINK });
    expect(put).toHaveLength(1);
    expect(seen).toContain(`PUT /api/v1/explorations/${'A'.repeat(43)}/snapshots/${sha}`);
  });

  test('an invalid one is refused, and nothing is kept or sent', async () => {
    const put: unknown[] = [];
    const { out, seen } = await run({ snapshot: { petal: 'snapshot/v1' }, exploration: LINK }, put);
    expect(JSON.stringify(out)).toContain("That isn't a valid snapshot/v1");
    expect(put).toHaveLength(0);
    expect(seen).toHaveLength(0);
  });

  test('with no project, it stays on this computer and says how to keep it there too', async () => {
    const put: unknown[] = [];
    const { out, seen } = await run({ snapshot: fixture('snapshot.v1.json') }, put);
    expect(put).toHaveLength(1);
    expect(seen).toHaveLength(0);
    expect(out.next).toMatch(/^Kept on this computer/);
  });
});
