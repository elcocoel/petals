// pnpm demo: the landing flower, worked again from what the repo ships, with no key, no wallet and no
// network. It runs the site's own tools in process, as a public site does (PETAL_PUBLIC=1: nothing outside
// is read, and any fetch fails the run): it reads the published entry and checks its hash and its maker's
// signature, loads the reading it was drawn from and checks that reading's hash, works the figures again
// and checks them against the entry's own claim, and draws it twice, the same both times. Each check prints
// PASS or FAIL with what was expected; the SVG lands in out/demo/. Exits 1 if any check fails.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';
import { callTool, configFromEnv, createContext } from '@petal/tools';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'out', 'demo');
/** The landing's drawing, as first published on NEAR testnet: who stands behind NEAR's validators. The landing shows the same spec published again on mainnet (62eaaefb…). */
const FLOWER = '9ac16c8917aa5ca579c8421a';
const MEASURE = 'validator_stake_current_epoch';
const TX = 'Bs8E4tJ3mFvkLaENbbY82hkAj5hWofZU5R4yVuh5UzXu';

const outside: string[] = [];
globalThis.fetch = async (u: unknown) => {
  outside.push(String(u));
  throw new Error('pnpm demo reaches nothing outside the repo');
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'state'), { recursive: true });
const ctx = createContext(
  configFromEnv({ PETAL_PUBLIC: '1', PETAL_STATE_DIR: join(OUT, 'state') }, ROOT),
);
const call = async (name: string, input: object): Promise<Out> => {
  const out = (await callTool(name, input, ctx)) as Out;
  if (out.error) throw new Error(`${name}: ${out.error.message}`);
  return out;
};

let failed = 0;
const check = (what: string, expected: unknown, actual: unknown) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  console.log(
    `      expected ${JSON.stringify(expected)}${ok ? '' : `, got ${JSON.stringify(actual)}`}`,
  );
};

try {
  console.log(`pnpm demo: flower ${FLOWER}, from the repo's fixtures, no key, no network\n`);

  const flower = await call('get_flower', { id: FLOWER });
  const entry = flower.entry;
  console.log(`${entry.title}\n`);
  check('the entry is the one the map holds, its hash checked', true, flower.verified.entry_hash);
  check("its maker's NEP-413 signature checks", true, flower.verified.maker_signature);
  check('its record on NEAR testnet (petals.testnet), by transaction', TX, flower.tx_hash);
  console.log(`      https://testnet.nearblocks.io/txns/${TX}`);

  const sha = entry.spec.snapshot.sha256 as string;
  const reading = await ctx.store.get(sha);
  check(
    'the reading it was drawn from ships in the repo, named by its own hash',
    sha,
    reading ? sha256Hex(canonicalJson(reading)) : null,
  );

  const fig = await call('compute_figures', { sha256: sha, measure: MEASURE });
  check('validators counted', 371, fig.participants_total);
  check('stake in the current epoch, NEAR', '593372642.814240027020784486594744', fig.total);
  // the entry says it in words: "9 validators together pass the one-third threshold..."
  const said = (entry.interpretation.power_means as Out[])
    .map((p) => /^(\d+) validators together pass the one-third/.exec(p.claim)?.[1])
    .find(Boolean);
  check(
    "validators to pass one third (Nakamoto), as the entry's own claim says",
    Number(said),
    fig.nakamoto.count,
  );
  check('concentration (HHI)', 0.021471, fig.hhi);
  check('inequality (Gini)', 0.836217, fig.gini);

  const drawn = await call('render_flower', { spec: entry.spec, include_svg: true });
  const again = await call('render_flower', { spec: entry.spec });
  check("the spec drawn is the entry's, by its hash", entry.spec_sha256, drawn.spec_sha256);
  check('drawn twice, the same picture (render hash)', drawn.render_sha256, again.render_sha256);
  check('petals drawn', 61, drawn.petals_drawn);
  check('nothing was read from outside the repo', [], outside);

  const svg = join(OUT, 'landing-flower.svg');
  writeFileSync(svg, drawn.svg);
  console.log(`\nSVG: ${svg}`);
} catch (e) {
  failed++;
  console.log(`FAIL  ${(e as Error).message}`);
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks pass.');
process.exit(failed ? 1 : 0);
