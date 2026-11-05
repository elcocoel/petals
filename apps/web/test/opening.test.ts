// The agent speaks first: written text, from real gallery entries, no model call.
import { describe, expect, test } from 'vitest';
import { parseMarkdown } from '../lib/markdown.ts';
import { openingMessage } from '../lib/opening.ts';
import { threadFromRun } from '../lib/thread.ts';

const map = { id: 'abc', title: "Who stands behind NEAR's validators?", where: 'map' as const };
const fixture = { id: 'fff', title: 'A stored example', where: 'fixture' as const };

describe('openingMessage', () => {
  test('offers what is published, and leaves stored examples out when there is any', () => {
    const text = openingMessage([fixture, map]);
    expect(text).toContain(`[${map.title}](/f/abc)`);
    expect(text).toContain('[gallery](/gallery)');
    expect(text).not.toContain('A stored example');
  });

  test('falls back to stored examples, and still talks with an empty or unreachable gallery', () => {
    expect(openingMessage([fixture])).toContain('[A stored example](/f/fff)');
    const empty = openingMessage([]);
    expect(empty).toContain('What are you curious about?');
    expect(empty).not.toContain('gallery');
  });

  test('shows at most three, and a title cannot break its link', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...map, id: `f${i}` }));
    expect(openingMessage(many).match(/\/f\/f\d/g)).toHaveLength(3);
    const odd = openingMessage([{ ...map, title: 'a [b] c' }]);
    expect(odd).toContain('[a b c](/f/abc)');
  });

  test('renders as links on this site', () => {
    const blocks = JSON.stringify(parseMarkdown(openingMessage([map]), new Set()));
    expect(blocks).toContain('"href":"/f/abc"');
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
