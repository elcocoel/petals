// petal as one file (T405): what a Petals site serves at /petal.mjs, so a person's own agent
// can add Petals' tools with no copy of the repo. `scripts/bundle.ts` makes it from this entry.
//
//   node petal.mjs mcp                 the tools over MCP stdio, for Claude Code, Codex, Hermes
//   node petal.mjs <command> [flags]   one tool, JSON out (`node petal.mjs help`)
//
// Every read, search, count and drawing runs on this machine, from its own address. The site it
// came from only receives and shows: the exploration, each flower with its reading, and the
// conversation (site.ts). State lives in ~/.petals (PETALS_HOME), never next to the file.
//
// Everything but types is imported once the environment is set: the input modules find their
// stored snapshots when they load.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The site that serves this file writes its own origin over this. Untouched, it means none. */
const SERVED_FROM: string = '%%PETALS_SITE%%';
/** node:sqlite without a flag. */
const NODE_MIN: [number, number] = [22, 13];

type Env = Record<string, string | undefined>;

const say = (code: string, message: string, hint?: string) =>
  `${JSON.stringify({ error: { code, message, ...(hint ? { hint } : {}) } }, null, 2)}\n`;

export function siteOf(env: Env): string | undefined {
  const given = env.PETALS_SITE?.trim() || (SERVED_FROM.startsWith('%%') ? '' : SERVED_FROM);
  return given ? given.replace(/\/+$/, '') : undefined;
}

export function nodeIsNew(version: string = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > NODE_MIN[0] || (major === NODE_MIN[0] && minor >= NODE_MIN[1]);
}

/**
 * The stored snapshots this file carries, laid out once per version of them in
 * <home>/fixtures/snapshots, where the input modules and the store look.
 */
function layOut(home: string, fixtures: { sha: string; files: Record<string, string> }): void {
  const dir = join(home, 'fixtures', 'snapshots');
  const mark = join(dir, '.version');
  try {
    if (readFileSync(mark, 'utf8').trim() === fixtures.sha) return;
  } catch {
    // not laid out yet
  }
  mkdirSync(dir, { recursive: true });
  for (const [name, b64] of Object.entries(fixtures.files)) {
    writeFileSync(join(dir, name), Buffer.from(b64, 'base64'));
  }
  writeFileSync(mark, `${fixtures.sha}\n`);
}

/** Node 22 calls node:sqlite experimental on every run; a person's agent needn't read that. */
function quietSqlite(): void {
  const emit = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === 'string' ? warning : warning.message;
    if (/SQLite is an experimental feature/.test(text)) return;
    (emit as (...a: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}

export async function fileMain(argv: string[], env: Env = process.env): Promise<number> {
  const err = (t: string) => void process.stderr.write(t);
  if (!nodeIsNew()) {
    err(
      say(
        'bad_input',
        `Petals needs Node ${NODE_MIN.join('.')} or newer; this is ${process.versions.node}.`,
        'Install a current Node (nodejs.org, or brew install node), then run this again.',
      ),
    );
    return 1;
  }
  const site = siteOf(env);
  if (!site) {
    err(
      say('bad_input', "This file doesn't know which Petals site it's from.", 'Set PETALS_SITE.'),
    );
    return 2;
  }
  quietSqlite();
  const home = env.PETALS_HOME?.trim() || join(homedir(), '.petals');
  try {
    const bundled = (await import('petal:fixtures')) as {
      default: { sha: string; files: Record<string, string> };
    };
    layOut(home, bundled.default);
  } catch {
    // run from the repo: its own fixtures are where the modules look
  }
  (globalThis as { __PETALS_HOME_URL__?: string }).__PETALS_HOME_URL__ = pathToFileURL(
    `${home}/`,
  ).href;

  // Links point at the site; state stays here; the shared map is read from NEAR, keyless.
  const own: Env = {
    ...env,
    PETAL_API: site,
    PETAL_STATE_DIR: env.PETAL_STATE_DIR || join(home, 'state'),
    PETALS_HOME: home,
    PETALS_SITE: site,
    PETAL_MAP_NETWORK: env.PETAL_MAP_NETWORK || 'testnet',
  };
  // Nothing here may spend or sign for anyone, whatever this shell holds, and this is the person's
  // own machine, never a public site.
  for (const k of [
    'NEAR_AI_API_KEY',
    'PETAL_WRITER_KEY_FILE',
    'BLOB_READ_WRITE_TOKEN',
    'PETAL_PUBLIC',
  ])
    delete own[k];

  const { main } = await import('./main.ts');
  const tools = await import('@petal/tools');
  const { siteDoor } = await import('./site.ts');
  const door = siteDoor({
    site,
    currentFile: join(own.PETAL_STATE_DIR as string, 'current.json'),
    ...(env.PETALS_EXPLORATION?.trim() ? { initial: env.PETALS_EXPLORATION.trim() } : {}),
  });
  const served = door.tools(tools.registry);
  const instructions =
    `These tools run on this machine and show this conversation on ${site}: ` +
    'start_exploration first, and each flower you render is saved there by itself.';
  return main(argv, {
    registry: served,
    createContext: tools.createContext,
    serveStdio: (ctx) => tools.serveStdio(ctx, { tools: served, instructions }),
    env: own,
    root: home,
    asFile: true,
  });
}
