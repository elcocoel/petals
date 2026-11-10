// The agent speaks first: written text, from real views of the one map, no model call.
import { describe, expect, test } from 'vitest';
import { parseMarkdown } from '../lib/markdown.ts';
import { openingMessage } from '../lib/opening.ts';
import { threadFromRun } from '../lib/thread.ts';

const view = (title: string, count: number, sha = 'abc') => ({
  title,
  count,
  view_url: `https://petals.test/d/${sha}`,
});
const map = view('NEAR validators', 8487);

describe('openingMessage', () => {
  test('offers views of the one shared map, by their flower on the site', () => {
    const text = openingMessage([map]);
    expect(text).toContain('[NEAR validators](https://petals.test/d/abc)');
    expect(text).toContain('[Power Map](/gallery)');
  });

  test('the largest three first, one per title, and still talks with an empty or unreachable map', () => {
    const text = openingMessage([
      view('Small', 3, 's'),
      view('NEAR validators', 8487, 'n1'),
      view('UNI delegates', 21919, 'u'),
      view('NEAR validators', 8487, 'n2'),
      view('ENS delegates', 8561, 'e'),
    ]);
    expect(text).toContain(
      "Or start from what's already mapped: [UNI delegates](https://petals.test/d/u), [ENS delegates](https://petals.test/d/e), [NEAR validators](https://petals.test/d/n1), or the whole [Power Map](/gallery).",
    );
    expect(text).not.toContain('Small');
    const empty = openingMessage([]);
    expect(empty).toContain('What are you curious about?');
    expect(empty).not.toContain('Power Map');
  });

  test('a title cannot break its link', () => {
    expect(openingMessage([view('a [b] c', 1)])).toContain('[a b c](https://petals.test/d/abc)');
  });

  test('renders as links on this site', () => {
    const blocks = JSON.stringify(parseMarkdown(openingMessage([map]), new Set()));
    expect(blocks).toContain('"href":"https://petals.test/d/abc"');
    expect(blocks).toContain('"href":"/gallery"');
  });

  test('a reopened conversation still starts with what the agent said', () => {
    const opening = openingMessage([map]);
    const items = threadFromRun({
      messages: [
        { role: 'assistant', content: opening },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'Hi.' },
      ],
      events: [
        { event: 'run', data: { run_id: 'r', resume_url: '/make?run=r' } },
        { event: 'message', data: { text: 'Hi.' } },
      ],
    });
    expect(items[0]).toEqual({ kind: 'message', text: opening });
    expect(items[1]).toEqual({ kind: 'user', text: 'hello' });
  });
});
