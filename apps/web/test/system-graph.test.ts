// The landing's system graph: its words are taken whole from the README and the docs, and its lines run
// square between the parts, as the system map's do.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LINES, PARTS, route } from '../lib/system-graph.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const plain = (s: string) => s.replace(/[’']/g, "'").replace(/\s+/g, ' ');

describe("the graph's words", () => {
  test.each(Object.values(PARTS))('$name says only what its source says', (part) => {
    const file = part.from.split(',')[0] ?? '';
    const source = plain(readFileSync(join(ROOT, file), 'utf8'));
    // a table cell ends without a full stop; the sentence it becomes adds one
    expect(source).toContain(plain(part.words).replace(/\.$/, ''));
  });

  test('every line joins two parts the graph has', () => {
    const ids = new Set<string>([...Object.keys(PARTS), 'server']);
    for (const line of LINES) {
      expect(ids.has(line.from)).toBe(true);
      expect(ids.has(line.to)).toBe(true);
    }
  });
});

describe('where a line runs', () => {
  const above = { x: 100, y: 0, w: 180, h: 60 };
  test('straight down when the parts line up', () => {
    const below = { x: 100, y: 120, w: 180, h: 60 };
    const drawn = route(
      { from: 'browser', to: 'site', route: 'down', travel: 'both' },
      above,
      below,
    );
    expect(drawn.d).toBe('M190 60 L190 120');
    expect(drawn.length).toBe(60);
  });

  test('one turn there and one back, halfway, when they don’t', () => {
    const below = { x: 400, y: 120, w: 180, h: 60 };
    const drawn = route(
      { from: 'agent', to: 'nearai', route: 'down', travel: 'both' },
      above,
      below,
    );
    expect(drawn.d).toBe('M190 60 L190 90 L490 90 L490 120');
    // the label sits on the longest run
    expect(drawn.at).toEqual({ x: 340, y: 90 });
  });

  test('a rail goes out past the left edge and back in', () => {
    const below = { x: 100, y: 600, w: 180, h: 60 };
    const drawn = route(
      { from: 'browser', to: 'social', route: 'rail', travel: 'back' },
      above,
      below,
      16,
    );
    expect(drawn.d).toBe('M100 30 L16 30 L16 630 L100 630');
  });
});
