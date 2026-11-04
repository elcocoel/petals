// T070: the petal CLI against a fake registry: subcommands come from the registry, argv becomes
// the tool input, the tool's JSON is printed as it is, and errors keep their codes.
import { TOOLS_VERSION } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { MEASURE, run, SHA, SVG } from './fake-registry.ts';

describe('commands come from the registry', () => {
  test('every tool has a command; short names follow tools.md', async () => {
    const { code, stdout } = await run(['help']);
    expect(code).toBe(0);
    for (const [command, tool] of [
      ['networks', 'list_networks'],
      ['snapshot', 'get_snapshot'],
      ['describe', 'describe_snapshot'],
      ['figures', 'compute_figures'],
      ['compare', 'compare_figures'],
      ['propose', 'propose_spec'],
      ['validate', 'validate_spec'],
      ['render', 'render_flower'],
      ['prepare-publish', 'prepare_publish'],
      ['quote', 'quote_payment'],
      ['count-signers', 'count_signers'],
    ]) {
      expect(stdout).toMatch(new RegExp(`^  ${command}\\s+${tool}`, 'm'));
    }
    expect(stdout).toMatch(/^ {2}mcp\s/m);
    expect(stdout).toMatch(/^ {2}api\s/m);
  });

  test('a tool without a short name gets its own name with dashes', async () => {
    const r = await run(['count-signers', 'marmaj.sputnik-dao.near']);
    expect(r.code).toBe(0);
    expect(r.calls).toEqual([{ name: 'count_signers', input: { dao: 'marmaj.sputnik-dao.near' } }]);
  });

  test('the tool name works as a command too', async () => {
    const r = await run(['compute_figures', SHA, '--measure', MEASURE]);
    expect(r.code).toBe(0);
    expect(r.calls.map((c) => c.name)).toEqual(['compute_figures']);
  });

  test('an unknown command is a usage error on stderr, exit 2', async () => {
    const r = await run(['bloom']);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(JSON.parse(r.stderr)).toMatchObject({
      error: { code: 'bad_input', message: 'unknown command: bloom' },
      tools_version: TOOLS_VERSION,
    });
  });

  test('an empty registry says so', async () => {
    const r = await run(['networks'], { deps: { registry: [] } });
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stderr).error.hint).toMatch(/registry is empty/);
    const help = await run(['help'], { deps: { registry: [] } });
    expect(help.stdout).toMatch(/none: @petal\/tools has not registered its tools yet/);
  });

  test('no arguments prints the help', async () => {
    const r = await run([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^petal: /);
  });

  test('help for one command lists its flags from the input schema', async () => {
    const r = await run(['figures', '--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^petal figures <sha256> {3}\(tool compute_figures\)/);
    expect(r.stdout).toMatch(/--measure\s+string required/);
    expect(r.stdout).toMatch(/--top-k\s+array/);
    expect(r.stdout).toMatch(/network id in place of the sha256/);
    const same = await run(['help', 'figures']);
    expect(same.stdout).toBe(r.stdout);
    const render = await run(['help', 'render']);
    expect(render.stdout).toMatch(/--out <file> writes the SVG/);
  });
});

describe('argv becomes the tool input', () => {
  test('bare words fill the positional fields', async () => {
    const r = await run(['describe', SHA]);
    expect(r.calls).toEqual([{ name: 'describe_snapshot', input: { sha256: SHA } }]);
    const q = await run(['networks', 'near']);
    expect(q.calls).toEqual([{ name: 'list_networks', input: { query: 'near' } }]);
  });

  test('flags are typed by the schema; kebab-case fills snake_case', async () => {
    const r = await run([
      'figures',
      SHA,
      '--measure',
      MEASURE,
      '--petals=30',
      '--nakamoto-threshold',
      '0.5',
      '--top-k',
      '1,5,10',
    ]);
    expect(r.code).toBe(0);
    expect(r.calls[0]).toEqual({
      name: 'compute_figures',
      input: {
        sha256: SHA,
        measure: MEASURE,
        petals: 30,
        nakamoto_threshold: 0.5,
        top_k: [1, 5, 10],
      },
    });
  });

  test('arrays also take JSON; objects take inline JSON or @file', async () => {
    const r = await run(['figures', SHA, '--measure', MEASURE, '--top-k', '[1,2]']);
    expect(r.calls[0]?.input.top_k).toEqual([1, 2]);
    const spec = { petal: 'spec/v1', marker: 1 };
    const inline = await run(['validate', JSON.stringify(spec)]);
    expect(inline.calls[0]).toEqual({ name: 'validate_spec', input: { spec } });
    const file = await run(['validate', '@s.json', '--interpretation', '@i.json'], {
      files: { 's.json': JSON.stringify(spec), 'i.json': '{"summary":"x"}' },
    });
    expect(file.calls[0]?.input).toEqual({ spec, interpretation: { summary: 'x' } });
    const path = await run(['validate', 's.json'], { files: { 's.json': JSON.stringify(spec) } });
    expect(path.calls[0]?.input).toEqual({ spec });
  });

  test('booleans: --flag, --flag=false, --no-flag', async () => {
    const spec = '{"petal":"spec/v1"}';
    const on = await run(['render', spec, '--include-svg']);
    expect(on.calls[0]?.input.include_svg).toBe(true);
    const off = await run(['render', spec, '--include-svg=false']);
    expect(off.calls[0]?.input.include_svg).toBe(false);
    const no = await run(['render', spec, '--no-include-svg']);
    expect(no.calls[0]?.input.include_svg).toBe(false);
    const fresh = await run(['snapshot', '--fresh', 'near-validators']);
    expect(fresh.calls[0]?.input).toEqual({ network: 'near-validators', fresh: true });
  });

  test('a union field takes a string or JSON', async () => {
    const date = await run(['snapshot', 'near-validators', '--at', '2026-01-01']);
    expect(date.calls[0]?.input.at).toBe('2026-01-01');
    const block = await run(['snapshot', 'near-validators', '--at', '{"block_height":1}']);
    expect(block.calls[0]?.input.at).toEqual({ block_height: 1 });
  });

  test('--input gives the whole input, inline, from a file or from stdin; flags override it', async () => {
    const inline = await run(['figures', '--input', `{"sha256":"${SHA}","measure":"m"}`]);
    expect(inline.calls[0]?.input).toEqual({ sha256: SHA, measure: 'm' });
    const stdin = await run(['figures', '--input', '-', '--petals', '5'], {
      stdin: JSON.stringify({ sha256: SHA, measure: 'm', petals: 60 }),
    });
    expect(stdin.calls[0]?.input).toEqual({ sha256: SHA, measure: 'm', petals: 5 });
    const file = await run(['quote', '--input', '@q.json'], {
      files: { 'q.json': '{"purpose":"sponsor_refresh","amount_usd":2}' },
    });
    expect(file.calls[0]?.input).toEqual({ purpose: 'sponsor_refresh', amount_usd: 2 });
  });

  test('a spec can come from stdin', async () => {
    const r = await run(['render', '-'], { stdin: '{"petal":"spec/v1"}' });
    expect(r.calls[0]?.input).toEqual({ spec: { petal: 'spec/v1' } });
  });

  test('propose: choice flags fill choices', async () => {
    const r = await run(['propose', 'near-validators', '--segments', 'backers', '--petals', '30']);
    expect(r.code).toBe(0);
    expect(r.calls.map((c) => c.name)).toEqual(['get_snapshot', 'propose_spec']);
    expect(r.calls[1]?.input).toEqual({
      network: 'near-validators',
      sha256: SHA,
      choices: { segments: 'backers', petals: 30 },
    });
  });

  test.each([
    [['figures', SHA, '--measure'], /--measure needs a value/],
    [['figures', SHA, '--petals', 'many', '--measure', 'm'], /--petals must be/],
    [['figures', SHA, '--petals', '2.5', '--measure', 'm'], /--petals must be a whole number/],
    [['figures', SHA, '--colour', 'kind'], /unknown flag --colour for petal figures/],
    [['describe', SHA, 'extra'], /too many arguments for petal describe/],
    [['validate', '{not json'], /the argument is not valid JSON/],
    [['figures', '--input', '[1]'], /--input must be a JSON object/],
    [['describe', SHA, '--at', 'latest'], /--at: only when a network id stands in for the sha256/],
    [['describe', SHA, '--network', 'near-validators'], /--network: only when a network id/],
    [['render', '{"petal":"spec/v1"}', '--segments', 'backers'], /--segments: only when a network/],
    [
      ['figures', 'near-validators', '--measure', 'm', '--segments', 'x'],
      /unknown flag --segments/,
    ],
    [['networks', '--out', 'x.svg'], /--out works only for tools that return an SVG/],
    [['prepare-publish', 'not-json'], /<entry> must be JSON/],
  ])('%j is a usage error', async (argv, message) => {
    const r = await run(argv as string[]);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    const e = JSON.parse(r.stderr);
    expect(e.error.code).toBe('bad_input');
    expect(e.error.message).toMatch(message);
    expect(r.calls).toEqual([]);
  });
});

describe('the network shorthand', () => {
  test('figures <network>: the snapshot, then the default proposal for measure and petals', async () => {
    const r = await run(['figures', 'near-validators']);
    expect(r.code).toBe(0);
    expect(r.calls.map((c) => c.name)).toEqual(['get_snapshot', 'propose_spec', 'compute_figures']);
    expect(r.calls[0]?.input).toEqual({ network: 'near-validators' });
    expect(r.calls[1]?.input).toEqual({ network: 'near-validators', sha256: SHA });
    expect(r.calls[2]?.input).toEqual({ sha256: SHA, measure: MEASURE, petals: 60 });
    // only the last tool's answer is printed
    expect(r.json).toMatchObject({ measure: MEASURE, petals: 60, tools_version: TOOLS_VERSION });
  });

  test('figures <network> --measure m needs no proposal', async () => {
    const r = await run(['figures', 'near-validators', '--measure', 'other', '--petals', '10']);
    expect(r.calls.map((c) => c.name)).toEqual(['get_snapshot', 'compute_figures']);
    expect(r.calls[1]?.input).toEqual({ sha256: SHA, measure: 'other', petals: 10 });
  });

  test('describe <network> takes the snapshot first; --at and --params go to it', async () => {
    const r = await run([
      'describe',
      'near-validators',
      '--at',
      'latest',
      '--params',
      '{"k":"v"}',
      '--top',
      '5',
    ]);
    expect(r.calls).toEqual([
      {
        name: 'get_snapshot',
        input: { network: 'near-validators', at: 'latest', params: { k: 'v' } },
      },
      { name: 'describe_snapshot', input: { sha256: SHA, top: 5 } },
    ]);
  });

  test('--network works in place of the bare word', async () => {
    const r = await run(['describe', '--network', 'near-validators']);
    expect(r.calls.map((c) => c.name)).toEqual(['get_snapshot', 'describe_snapshot']);
  });

  test('render <network>: snapshot, proposal with the choice flags, render', async () => {
    const r = await run(['render', 'near-validators', '--segments', 'backers', '--size', '400']);
    expect(r.code).toBe(0);
    expect(r.calls.map((c) => c.name)).toEqual(['get_snapshot', 'propose_spec', 'render_flower']);
    expect(r.calls[1]?.input).toEqual({
      network: 'near-validators',
      sha256: SHA,
      choices: { segments: 'backers' },
    });
    const render = r.calls[2]?.input as { spec: { encodings: unknown }; size: number };
    expect(render.spec.encodings).toEqual({ segments: { by: 'backers' } });
    expect(render.size).toBe(400);
    expect(r.json).toHaveProperty('view_url');
  });

  test('render <network> --choices takes JSON', async () => {
    const r = await run(['render', 'near-validators', '--choices', '{"width":"equal"}']);
    expect(r.calls[1]?.input.choices).toEqual({ width: 'equal' });
  });

  test('a network Petal cannot read: the tool error is the answer, exit 1', async () => {
    const r = await run(['render', 'bitcoin-whales']);
    expect(r.code).toBe(1);
    expect(r.calls.map((c) => c.name)).toEqual(['get_snapshot']);
    expect(r.json).toEqual({
      error: {
        code: 'cannot_read',
        message: "Petal can't read bitcoin-whales yet",
        hint: 'It can read near-validators.',
      },
    });
  });
});

describe('output', () => {
  test('stdout is the tool output as pretty JSON, nothing else', async () => {
    const r = await run(['networks']);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe(`${JSON.stringify(r.json, null, 2)}\n`);
    expect(r.json).toMatchObject({ tools_version: TOOLS_VERSION });
  });

  test('a tool error goes to stdout as JSON, exit 1', async () => {
    const r = await run(['flower', 'abc']);
    expect(r.code).toBe(1);
    expect(r.json).toEqual({ error: { code: 'not_found', message: 'no flower abc' } });
  });

  test('a thrown error (a stub) goes to stderr with its code, exit 1', async () => {
    const r = await run(['labels']);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(JSON.parse(r.stderr).error).toEqual({
      code: 'not_implemented',
      message: 'not_implemented: get_labels (W4, Phase B)',
    });
  });

  test('a stub createContext is reported the same way', async () => {
    const r = await run(['networks'], {
      deps: {
        createContext: () => {
          throw Object.assign(new Error('not_implemented: createContext'), {
            code: 'not_implemented',
          });
        },
      },
    });
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stderr).error.code).toBe('not_implemented');
  });

  test('render --out writes the SVG and prints the rest', async () => {
    const r = await run(['render', 'near-validators', '--out', 'flower.svg']);
    expect(r.code).toBe(0);
    expect(r.calls[2]?.input.include_svg).toBe(true);
    expect(r.files['flower.svg']).toBe(SVG);
    expect(r.json).not.toHaveProperty('svg');
    expect(r.json).toHaveProperty('render_sha256');
    expect(r.stderr).toMatch(/^wrote flower\.svg \(\d+ bytes\)\n$/);
  });

  test('progress from long tools goes to stderr, unless --quiet', async () => {
    const progressing = (quiet: boolean) =>
      run(['snapshot', 'near-validators', ...(quiet ? ['--quiet'] : [])], {
        deps: {
          registry: [
            {
              name: 'get_snapshot',
              input: { type: 'object', properties: { network: { type: 'string' } } },
              output: {},
              run: async (_i: never, ctx) => {
                ctx.onProgress?.({ stage: 'fetching', message: 'validators', done: 1, total: 3 });
                return { sha256: SHA };
              },
            },
          ],
        },
      });
    const loud = await progressing(false);
    expect(loud.stderr).toBe('fetching: validators (1/3)\n');
    expect(loud.json).toEqual({ sha256: SHA });
    const quiet = await progressing(true);
    expect(quiet.stderr).toBe('');
  });
});

describe('config', () => {
  test('--fake and --root reach the tools config', async () => {
    const r = await run(['networks', '--fake', '--root', 'elsewhere']);
    expect(r.configs).toEqual([expect.objectContaining({ root: '/work/elsewhere', fake: true })]);
    const plain = await run(['networks']);
    expect(plain.configs).toEqual([expect.objectContaining({ root: '/repo', fake: false })]);
  });
});
