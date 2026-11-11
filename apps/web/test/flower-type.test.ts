// The flower's words are drawn in the type their widths and lines are measured for (core's wedge/words.ts: Mono,
// 11/16): its class is one the design system defines, so they never fall back to the page's body type.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MONO } from '@petal/core/wedge/words';
import { describe, expect, test } from 'vitest';

describe("the flower's type", () => {
  test('is a type class the site defines', () => {
    const css = readFileSync(join(import.meta.dirname, '../app/tokens.generated.css'), 'utf8');
    expect(css).toMatch(new RegExp(`@utility ${MONO} \\{`));
  });
});
