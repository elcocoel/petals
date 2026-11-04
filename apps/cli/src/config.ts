// The tools' Config from the environment (.env.example): @petal/tools' configFromEnv, the one
// mapping every door uses, so PETAL_FAKE=1 and the rest mean the same here as on the site. The CLI
// adds only its --fake flag. It never reads ../.secrets/ itself: a key file is only ever a path
// handed on to the tools.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { type Config, configFromEnv as toolsConfigFromEnv } from '@petal/tools';

export type Env = Record<string, string | undefined>;

/** The repo root: PETAL_ROOT, else the nearest folder above `from` with pnpm-workspace.yaml. */
export function findRoot(env: Env, from: string): string {
  if (env.PETAL_ROOT) return resolve(env.PETAL_ROOT);
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dirname(dir) === dir) return resolve(from);
  }
}

/** The environment's Config; the --fake flag turns fake mode on as PETAL_FAKE=1 does. */
export function configFromEnv(env: Env, root: string, opts: { fake?: boolean } = {}): Config {
  const cfg = toolsConfigFromEnv(env, root);
  return opts.fake ? { ...cfg, fake: true } : cfg;
}
