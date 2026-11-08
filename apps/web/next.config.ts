// Next.js for the site and the API (research R12). The workspace packages are TypeScript sources
// (their exports point at src/*.ts) that read fixtures next to themselves through
// import.meta.url, so the server loads them with Node itself (Node 24 strips types) instead of
// bundling them: serverExternalPackages.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const root = fileURLToPath(new URL('../..', import.meta.url));
const app = fileURLToPath(new URL('.', import.meta.url));

/**
 * Everything the workspace packages load at run time. They stay outside the bundle
 * (serverExternalPackages), and pnpm's symlinks hide them from the file tracer, so a host would ship
 * without them. This walks the real production dependency tree and names exactly those folders.
 */
function runtimeFiles(): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  const skip = new Set(['next', 'react', 'react-dom']);
  const find = (from: string, dep: string) => {
    for (let d = from; ; d = dirname(d)) {
      const candidate = join(d, 'node_modules', dep);
      if (existsSync(join(candidate, 'package.json'))) return candidate;
      if (d === dirname(d)) return null;
    }
  };
  const walk = (dir: string) => {
    const real = realpathSync(dir);
    if (seen.has(real)) return;
    seen.add(real);
    // pnpm keeps a package's own dependencies as symlinks beside it: take that whole folder.
    const at = real.lastIndexOf(`${join('.pnpm', '')}`);
    if (at !== -1) {
      const store = real.slice(0, real.indexOf('/node_modules/', at) + '/node_modules'.length);
      out.add(`${relative(app, store)}/**`);
    } else {
      out.add(`${relative(app, real)}/node_modules/**`);
    }
    const pkg = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      if (skip.has(dep)) continue;
      const found = find(real, dep);
      if (found) walk(found);
    }
  };
  walk(app);
  return [...out];
}

const config: NextConfig = {
  serverExternalPackages: [
    '@petal/core',
    '@petal/inputs',
    '@petal/near',
    '@petal/store',
    '@petal/tools',
    '@petal/agent',
  ],
  turbopack: { root },
  outputFileTracingRoot: root,
  // On a host, files read at run time must be traced in: the sources Node runs directly, the
  // fixtures, the skill, and the workspace file repoRoot() looks for.
  outputFileTracingIncludes: {
    '/**': [
      '../../pnpm-workspace.yaml',
      '../../fixtures/**',
      '../../skill/petal/SKILL.md',
      '../../packages/*/src/**',
      '../../packages/*/schema/**',
      '../../packages/*/package.json',
      './node_modules/@petal/*',
      ...runtimeFiles(),
    ],
  },
  // `tsc -b` (pnpm typecheck) checks this app with the rest of the workspace; tsconfig.json is its
  // project file, so Next gets a separate one it may rewrite.
  typescript: { tsconfigPath: 'tsconfig.next.json' },
  // Next 16.4 writes an AGENTS.md into the app on dev; the repo keeps its own instructions.
  agentRules: false,
};

export default config;
