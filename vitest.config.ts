// One Vitest project per package, plus scripts and tests/e2e (T006).
// Vitest 5 reads `test.projects` from this file; it ignores a vitest.workspace.ts.
//   pnpm test                    every project except e2e
//   pnpm test:e2e                only e2e
//   pnpm vitest run --project near   one package
import { defineConfig } from 'vitest/config';

const unit = (name: string, root: string) => ({
  test: { name, root, include: ['test/**/*.test.ts'] },
});

export default defineConfig({
  test: {
    projects: [
      unit('tokens', 'packages/tokens'),
      unit('core', 'packages/core'),
      unit('store', 'packages/store'),
      unit('inputs', 'packages/inputs'),
      unit('near', 'packages/near'),
      unit('tools', 'packages/tools'),
      unit('agent', 'packages/agent'),
      unit('web', 'apps/web'),
      unit('cli', 'apps/cli'),
      unit('scripts', 'scripts'),
      { test: { name: 'e2e', root: 'tests/e2e', include: ['**/*.test.ts'] } },
    ],
  },
});
