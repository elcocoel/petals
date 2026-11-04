// Next.js for the site and the API (research R12). The workspace packages are TypeScript sources
// (their exports point at src/*.ts) that read fixtures next to themselves through
// import.meta.url, so the server loads them with Node itself (Node 24 strips types) instead of
// bundling them: serverExternalPackages.
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const root = fileURLToPath(new URL('../..', import.meta.url));

const config: NextConfig = {
  serverExternalPackages: [
    '@petal/core',
    '@petal/inputs',
    '@petal/near',
    '@petal/tools',
    '@petal/agent',
  ],
  turbopack: { root },
  outputFileTracingRoot: root,
  // `tsc -b` (pnpm typecheck) checks this app with the rest of the workspace; tsconfig.json is its
  // project file, so Next gets a separate one it may rewrite.
  typescript: { tsconfigPath: 'tsconfig.next.json' },
  // Next 16.4 writes an AGENTS.md into the app on dev; the repo keeps its own instructions.
  agentRules: false,
};

export default config;
