// T198: the relations tools on the real registry and a real snapshot store. No sign-in, and the index
// builds itself from what's stored.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { beforeAll, describe, expect, test } from 'vitest';
import { callTool, describeTool, registry } from '../src/registry.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Json = Record<string, any>;
let r: TestRig;
const call = async (name: string, input: Json): Promise<Json> =>
  (await callTool(name, input, r.ctx)) as Json;

beforeAll(async () => {
  r = await rig();
});

const ENS_ID = (o: Json) =>
  (o.groups as Json[]).find((g) => g.title === 'ENS delegates')?.id as string;

describe('first use', () => {
  test('nothing is built until something is asked, then index.db sits in the state folder', async () => {
    const fresh = await rig();
    const path = join(fresh.stateDir, 'index.db');
    expect(existsSync(path)).toBe(false);
    const out = (await callTool('relations_overview', {}, fresh.ctx)) as Json;
    expect(out.error).toBeUndefined();
    expect(out.groups.length).toBeGreaterThan(0);
    expect(existsSync(path)).toBe(true);
    expect(existsSync(join(fresh.stateDir, 'private.db'))).toBe(false);
  });

  test('deleted or broken: the tool still answers, and the same', async () => {
    const fresh = await rig();
    const path = join(fresh.stateDir, 'index.db');
    const before = await callTool('relations_overview', { kind: 'holdings' }, fresh.ctx);
    rmSync(path);
    expect(await callTool('relations_overview', { kind: 'holdings' }, fresh.ctx)).toEqual(before);
    writeFileSync(path, 'not a database');
    expect(await callTool('relations_overview', { kind: 'holdings' }, fresh.ctx)).toEqual(before);
  });

  test('a snapshot stored through the store shows up in the next answer', async () => {
    const fresh = await rig();
    const groupsBefore = (
      (await callTool('relations_overview', { kind: 'all' }, fresh.ctx)) as Json
    ).groups;
    const s: Snapshot = {
      petal: 'snapshot/v1',
      network: { id: 'test-new', chain: 'eip155:1', population: 'new', title: 'A new group' },
      snapshot: { as_of: '2026-11-05T00:00:00Z', final: true },
      coverage: {
        participants_total: 1,
        participants_included: 1,
        amount_total: '1',
        amount_included: '1',
        unit: 'T',
        measure: 'token_balance',
      },
      sources: [
        { id: 's', kind: 'chain', url: 'https://x.test', fetched_at: '2026-11-05T00:00:00Z' },
      ],
      participants: [
        { id: `0x${'b'.repeat(40)}`, label: 'x', kind: 'unknown', identity: null, source: 's' },
      ],
      holdings: [
        {
          participant: `0x${'b'.repeat(40)}`,
          asset: 'T',
          measure: 'token_balance',
          amount: '1',
          unit: 'T',
          as_of: '2026-11-05T00:00:00Z',
          source: 's',
        },
      ],
      relationships: [],
      events: [],
      module: { id: 'test-new', version: 't/1' },
    } as unknown as Snapshot;
    const { sha256 } = await fresh.store.put(s);
    expect(sha256).toBe(sha256Hex(canonicalJson(s)));
    const after = (await callTool('relations_overview', { kind: 'all' }, fresh.ctx)) as Json;
    expect(after.groups.length).toBe(groupsBefore.length + 1);
    expect(after.groups.map((g: Json) => g.snapshot_sha256)).toContain(sha256);
  });
});

describe('what each tool says', () => {
  test('overview: the pairs and their honesty, and a kind filter that makes it small', async () => {
    const small = await call('relations_overview', { kind: 'holdings', min_shared: 2 });
    expect(small.tools_version).toBe('tools/v2');
    expect(small.groups.every((g: Json) => g.kind === 'holdings')).toBe(true);
    expect(small.pairs.every((p: Json) => p.shared >= 2)).toBe(true);
    for (const p of small.pairs) {
      expect(typeof p.at_least).toBe('boolean');
      expect(p.as_of_a).toBeTruthy();
      expect(p.gap_seconds).toBeGreaterThanOrEqual(0);
      expect(['observed', 'inferred']).toContain(p.match.status);
    }
    expect(small.does_not_show).toMatch(/not coordination/);
    const byDefault = await call('relations_overview', {});
    expect(byDefault.kind).toBe('holdings');
    expect(byDefault.groups_left_out).toBeGreaterThan(400);
    expect(JSON.stringify(byDefault).length).toBeLessThan(20_000);
    const full = await call('relations_overview', { kind: 'all', limit: 1 });
    expect(full.groups.length).toBeGreaterThan(small.groups.length);
    expect(full.groups_left_out).toBe(0);
    expect(full.pairs).toHaveLength(1);
    expect(full.pairs_more).toBe(full.pairs_total - 1);
  });

  test('shared_accounts from a snapshot hash, a group id, and a pinned date', async () => {
    const o = await call('relations_overview', { kind: 'holdings' });
    const ens = (o.groups as Json[]).find((g) => g.title === 'ENS delegates') as Json;
    const moloch = (o.groups as Json[]).find((g) => g.module === 'moloch-v1') as Json;
    const byId = await call('shared_accounts', { group_a: ens.id, group_b: moloch.id });
    expect(byId).toMatchObject({ shared: 2, at_least: false, match: { status: 'observed' } });
    expect(byId.gap_days).toBeGreaterThan(1800);
    const byHash = await call('shared_accounts', {
      group_a: ens.snapshot_sha256,
      group_b: moloch.snapshot_sha256,
    });
    expect(byHash.shared).toBe(2);
    const pinned = await call('shared_accounts', {
      group_a: `${ens.id}@${ens.snapshot_sha256}`,
      group_b: moloch.id,
    });
    expect(pinned.shared).toBe(2);
  });

  test('related_groups carries the same pair as shared_accounts', async () => {
    const o = await call('relations_overview', { kind: 'holdings' });
    const related = await call('related_groups', { group: ENS_ID(o), limit: 50 });
    const top = related.related.find((g: Json) => g.group.kind === 'holdings') as Json;
    const shared = await call('shared_accounts', {
      group_a: ENS_ID(o),
      group_b: top.group.group_id,
      limit: 0,
    });
    expect(shared.shared).toBe(top.shared);
    expect(shared.weight).toBe(top.weight);
    expect(shared.gap_seconds).toBe(top.gap_seconds);
    expect(shared.accounts).toEqual([]);
  });

  test('account_groups on an unknown account is an answer, not an error', async () => {
    const out = await call('account_groups', { account: 'near:mainnet:no-such-account-here.near' });
    expect(out.error).toBeUndefined();
    expect(out).toMatchObject({ groups: [], total: 0, at_least: true });
  });

  test('power_path gives up in words', async () => {
    const out = await call('power_path', {
      account_a: 'near:mainnet:no-such-account-here.near',
      account_b: 'near:mainnet:nor-this-one-here.near',
    });
    expect(out).toMatchObject({ found: false, reason: 'unknown_account', gave_up: false });
  });
});

describe('errors', () => {
  test.each([
    ['shared_accounts', { group_a: 'x' }, 'bad_input'],
    ['shared_accounts', { group_a: 'x', group_b: 'y' }, 'not_found'],
    ['related_groups', { group: 'x', by: 'size' }, 'bad_input'],
    ['related_groups', { group: 'x' }, 'not_found'],
    ['relations_overview', { min_shared: 0 }, 'bad_input'],
    ['account_groups', {}, 'bad_input'],
    ['power_path', { account_a: 'a', account_b: 'b', max_depth: 99 }, 'bad_input'],
    ['power_path', { account_a: 'a', account_b: 'b', include_inferred: 'yes' }, 'bad_input'],
  ])('%s %j is %s', async (tool, input, code) => {
    const out = await call(tool, input);
    expect(out.error.code).toBe(code);
    expect(out.tools_version).toBe('tools/v2');
  });

  test('one group named twice is refused, and says how to compare its dates', async () => {
    const o = await call('relations_overview', { kind: 'holdings' });
    const beanstalk = (o.groups as Json[]).find((g) => g.module === 'beanstalk') as Json;
    const out = await call('shared_accounts', { group_a: beanstalk.id, group_b: beanstalk.id });
    expect(out.error.code).toBe('bad_input');
    expect(out.error.hint).toContain('@');
  });
});

test('no tool claims a person or common control', async () => {
  const names = [
    'account_groups',
    'shared_accounts',
    'related_groups',
    'relations_overview',
    'power_path',
  ];
  for (const t of registry.filter((x) => names.includes(x.name))) {
    const { annotations, description: text } = describeTool(t);
    expect(annotations?.readOnlyHint, t.name).toBe(true);
    expect(text, t.name).toMatch(/does not show|says nothing|not influence|not coordination/i);
  }
});
