// Server only. The repo root and petalApp's Config, read from the environment (.env.example).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Config } from '@petal/tools';

/** The workspace root (the folder with pnpm-workspace.yaml), found upward from the cwd. */
export function repoRoot(from: string = process.cwd()): string {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`petal web: no pnpm-workspace.yaml above ${from}`);
    dir = up;
  }
}

/**
 * petalApp's Config from the environment. Every variable is optional (quickstart.md,
 * .env.example). The mapping is @petal/tools' own, the one `pnpm api` and the tools use, so the
 * site reads the same variables: PETAL_FAKE=1 (fakes everywhere: recorded agent, fake map,
 * recorded quote), PETAL_STATE_DIR, PETAL_FIXTURES_DIR, PETAL_API, the map and the keys.
 */
export async function configFromEnv(root: string = repoRoot()): Promise<Config> {
  // Loaded by Node itself, never bundled (see server-app.ts): a bundled @petal/inputs breaks on
  // its new URL(..., import.meta.url) fixture paths.
  const tools = (await import(
    /* turbopackIgnore: true */ /* webpackIgnore: true */ '@petal/tools'
  )) as typeof import('@petal/tools');
  return tools.configFromEnv(process.env, root);
}
