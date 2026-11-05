// T070 parity: the CLI and HTTP return the same JSON (contracts/tools.md, Contract tests).
// 1. Against the fake registry: the CLI prints exactly what the tool returns, adding nothing.
//    Every HTTP route returns what its tool returns (http-api.md), so the two doors agree.
// 2. Against the real registry, once @petal/tools registers its tools (W4): the CLI and
//    httpApp give the same JSON for the same call, on one fake-mode context.
import { join } from 'node:path';
import { createContext, httpApp, registry, serveStdio } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { type AnyTool, main } from '../src/main.ts';
import { direct, MEASURE, run, SHA } from './fake-registry.ts';

const ROOT = join(import.meta.dirname, '../../..');

describe('the CLI adds nothing to a tool answer (fake registry)', () => {
  const spec = { petal: 'spec/v1', marker: 'a spec' };
  test.each([
    ['list_networks', ['networks'], {}],
    ['list_networks', ['networks', 'house'], { query: 'house' }],
    ['get_network', ['network', 'near-validators'], { id: 'near-validators' }],
    ['get_snapshot', ['snapshot', 'near-validators'], { network: 'near-validators' }],
    ['describe_snapshot', ['describe', SHA, '--top', '5'], { sha256: SHA, top: 5 }],
    [
      'compute_figures',
      ['figures', SHA, '--measure', MEASURE, '--petals', '60'],
      { sha256: SHA, measure: MEASURE, petals: 60 },
    ],
    [
      'propose_spec',
      ['propose', '--input', JSON.stringify({ network: 'near-validators', sha256: SHA })],
      { network: 'near-validators', sha256: SHA },
    ],
    ['validate_spec', ['validate', JSON.stringify(spec)], { spec }],
    [
      'render_flower',
      ['render', JSON.stringify(spec), '--include-svg'],
      { spec, include_svg: true },
    ],
    ['list_flowers', ['flowers'], {}],
    ['quote_payment', ['quote', 'sponsor_refresh'], { purpose: 'sponsor_refresh' }],
    [
      'compare_figures',
      ['compare', SHA, 'f'.repeat(64), '--measure', MEASURE],
      { a: SHA, b: 'f'.repeat(64), measure: MEASURE },
    ],
  ])('%s', async (tool, argv, input) => {
    const cli = await run(argv as string[]);
    expect(cli.code).toBe(0);
    expect(cli.calls).toEqual([{ name: tool, input }]);
    expect(cli.json).toEqual(await direct(tool, input));
  });

  test('errors too', async () => {
    const cli = await run(['flower', 'nope']);
    expect(cli.json).toEqual(await direct('get_flower', { id: 'nope' }));
  });
});

const ready = (registry as readonly unknown[]).length > 0;

describe.runIf(ready)('the CLI and HTTP agree (real registry, fake mode)', () => {
  const ctx = ready ? createContext({ root: ROOT, fake: true }) : undefined;
  const app = ready && ctx ? httpApp(ctx) : undefined;
  /** Fields that belong to a transport rather than to the tool answer. None so far. */
  const TRANSPORT: string[] = [];
  const strip = (x: unknown) => {
    if (typeof x !== 'object' || x === null) return x;
    return Object.fromEntries(Object.entries(x).filter(([k]) => !TRANSPORT.includes(k)));
  };

  async function cli(argv: string[]): Promise<unknown> {
    let out = '';
    await main(argv, {
      registry: registry as readonly AnyTool[],
      createContext: () => ctx as NonNullable<typeof ctx>,
      serveStdio,
      root: ROOT,
      env: {},
      stdout: (t) => {
        out += t;
      },
      stderr: () => {},
    });
    return strip(JSON.parse(out));
  }
  async function http(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await (app as NonNullable<typeof app>).request(path, init);
    return strip(await res.json());
  }
  const input = (x: unknown) => ['--input', JSON.stringify(x)];

  test('networks', async () => {
    expect(await cli(['networks'])).toEqual(await http('GET', '/api/v1/networks'));
  });

  test('find', async () => {
    const out = await cli(['find', 'house of stake']);
    expect(out).toEqual(await http('GET', '/api/v1/find?query=house%20of%20stake'));
    expect((out as { calls: number }).calls).toBe(0);
  });

  test('snapshot, describe, propose, figures, validate, render', async () => {
    const snapBody = { network: 'near-validators' };
    const snap = (await http('POST', '/api/v1/snapshots', snapBody)) as { sha256: string };
    expect(await cli(['snapshot', ...input(snapBody)])).toEqual(snap);

    const { sha256 } = snap;
    expect(await cli(['describe', sha256, '--top', '10'])).toEqual(
      await http('GET', `/api/v1/snapshots/${sha256}/describe?top=10`),
    );

    const proposeBody = { network: 'near-validators', sha256, choices: { segments: 'backers' } };
    const proposal = (await http('POST', '/api/v1/specs/propose', proposeBody)) as {
      spec: { selection: { measure: string; petals?: number } };
      spec_sha256: string;
    };
    expect(await cli(['propose', ...input(proposeBody)])).toEqual(proposal);

    const { measure, petals } = proposal.spec.selection;
    const figuresBody = { sha256, measure, ...(petals ? { petals } : {}) };
    expect(await cli(['figures', ...input(figuresBody)])).toEqual(
      await http('POST', '/api/v1/figures', figuresBody),
    );

    const validateBody = { spec: proposal.spec };
    expect(await cli(['validate', ...input(validateBody)])).toEqual(
      await http('POST', '/api/v1/specs/validate', validateBody),
    );

    const renderBody = { spec: proposal.spec, include_svg: false };
    expect(await cli(['render', ...input(renderBody)])).toEqual(
      await http('POST', '/api/v1/render', renderBody),
    );
  });

  test('the relations tools', async () => {
    const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
    const overview = (await http(
      'GET',
      `/api/v1/relations/overview?${q({ kind: 'holdings' })}`,
    )) as { pairs: { a: string; b: string }[] };
    expect(await cli(['relations-overview', '--kind', 'holdings'])).toEqual(overview);
    const { a, b } = overview.pairs[0] as { a: string; b: string };

    const shared = (await http(
      'GET',
      `/api/v1/relations/shared?${q({ group_a: a, group_b: b, limit: '2' })}`,
    )) as { shared: number; accounts: { account_a: string; account_b: string }[] };
    expect(shared.shared).toBeGreaterThan(0);
    expect(await cli(['shared-accounts', a, b, '--limit', '2'])).toEqual(shared);

    expect(await cli(['related-groups', a, '--by', 'share'])).toEqual(
      await http('GET', `/api/v1/relations/related?${q({ group: a, by: 'share' })}`),
    );

    const account = shared.accounts[0]?.account_a as string;
    expect(await cli(['account-groups', account])).toEqual(
      await http('GET', `/api/v1/relations/account-groups?${q({ account })}`),
    );

    const other = shared.accounts[1]?.account_a ?? account;
    expect(await cli(['power-path', account, other, '--max-depth', '2'])).toEqual(
      await http(
        'GET',
        `/api/v1/relations/path?${q({ account_a: account, account_b: other, max_depth: '2' })}`,
      ),
    );
  });

  test('the shorthand gives what the long way gives over HTTP', async () => {
    const { sha256 } = (await http('POST', '/api/v1/snapshots', {
      network: 'near-validators',
    })) as { sha256: string };
    const plain = (await http('POST', '/api/v1/specs/propose', {
      network: 'near-validators',
      sha256,
    })) as { spec: { selection: { measure: string; petals?: number } } };
    const { measure, petals } = plain.spec.selection;
    expect(await cli(['figures', 'near-validators'])).toEqual(
      await http('POST', '/api/v1/figures', { sha256, measure, ...(petals ? { petals } : {}) }),
    );

    const backers = (await http('POST', '/api/v1/specs/propose', {
      network: 'near-validators',
      sha256,
      choices: { segments: 'backers' },
    })) as { spec: unknown; spec_sha256: string };
    const rendered = (await cli([
      'render',
      'near-validators',
      '--segments',
      'backers',
      '--no-include-svg',
    ])) as { spec_sha256: string };
    expect(rendered.spec_sha256).toBe(backers.spec_sha256);
    expect(rendered).toEqual(
      await http('POST', '/api/v1/render', { spec: backers.spec, include_svg: false }),
    );
  });
});
