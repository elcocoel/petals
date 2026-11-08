// Makes petal as one file (T405): apps/cli/dist/petal.mjs, which a Petals site serves at
// /petal.mjs with its own origin written in. The CLI and the tools, the stored snapshots they read,
// and nothing that runs Petals' own agent. Run by the site's build (apps/web), or by hand:
//   node apps/cli/scripts/bundle.ts
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';

const CLI = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(dirname(CLI));
export const OUT = join(CLI, 'dist', 'petal.mjs');
const SNAPSHOTS = join(ROOT, 'fixtures', 'snapshots');

/** The stored snapshots as one module: file name to base64, and a hash of them all. */
function fixturesModule(): string {
  const files: Record<string, string> = {};
  const hash = createHash('sha256');
  for (const name of readdirSync(SNAPSHOTS).sort()) {
    const path = join(SNAPSHOTS, name);
    if (!statSync(path).isFile()) continue; // test/ holds the tests' own
    if (!(name === 'index.json' || name.endsWith('.json.gz'))) continue;
    const bytes = readFileSync(path);
    hash.update(name).update(bytes);
    files[name] = bytes.toString('base64');
  }
  return `export default ${JSON.stringify({ sha: hash.digest('hex'), files })};`;
}

/**
 * The input modules find fixtures/snapshots next to the repo's source. In the file they're in the
 * person's Petals folder, which file.ts sets before any module loads. Fails if the line moved, so a
 * change there can't quietly break the file.
 */
const FIXTURE_LINE = "new URL('../../../../fixtures/snapshots/', import.meta.url)";
const relocate: Plugin = {
  name: 'petal-file',
  setup(b) {
    b.onResolve({ filter: /^petal:fixtures$/ }, () => ({ path: 'fixtures', namespace: 'petal' }));
    b.onLoad({ filter: /.*/, namespace: 'petal' }, () => ({
      contents: fixturesModule(),
      loader: 'js',
    }));
    // `petal connect` writes an agent's own settings, and it needs a copy of the repo, so the file
    // refuses it (main.ts, asFile). Its code stays out of the file too: what a person's agent reads
    // and runs should hold nothing that changes their app.
    b.onLoad({ filter: /apps\/cli\/src\/connect\.ts$/ }, () => ({
      contents: [
        "export const CONNECT_HELP = '';",
        'export async function connect() { return 2; }',
        'export function spawnCommand() { return () => { throw new Error("no connect in the file"); }; }',
      ].join('\n'),
      loader: 'js',
    }));
    b.onLoad({ filter: /packages\/inputs\/src\/modules\/near-validators\.ts$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      if (!src.includes(FIXTURE_LINE)) {
        throw new Error(`bundle: ${relative(ROOT, args.path)} no longer has ${FIXTURE_LINE}`);
      }
      return {
        contents: src.replace(
          FIXTURE_LINE,
          "new URL('fixtures/snapshots/', globalThis.__PETALS_HOME_URL__ ?? import.meta.url)",
        ),
        loader: 'ts',
      };
    });
  },
};

export async function bundle(): Promise<{ bytes: number }> {
  await build({
    stdin: {
      contents:
        "import { fileMain } from './src/file.ts';\nprocess.exitCode = await fileMain(process.argv.slice(2));\n",
      resolveDir: CLI,
      sourcefile: 'petal-file-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22.13',
    outfile: OUT,
    plugins: [relocate],
    // CommonJS dependencies (ajv) call require; give them one.
    banner: {
      js: "#!/usr/bin/env node\nimport { createRequire as __petalRequire } from 'node:module';\nconst require = __petalRequire(import.meta.url);",
    },
    // Petals' own agent and its HTTP server aren't in the file: the person's agent is theirs.
    external: ['@petal/agent', '@hono/node-server'],
    legalComments: 'none',
    logLevel: 'warning',
  });
  return { bytes: statSync(OUT).size };
}

if (import.meta.main) {
  const { bytes } = await bundle();
  process.stderr.write(`${relative(process.cwd(), OUT)}: ${(bytes / 1e6).toFixed(1)} MB\n`);
}
