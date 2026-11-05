// T166: the agent's answers as rendered Markdown, and no way for its words to become HTML.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Markdown } from '../components/Markdown.tsx';
import { parseMarkdown } from '../lib/markdown.ts';

const html = (text: string, seen?: Set<string>) =>
  renderToStaticMarkup(createElement(Markdown, { blocks: parseMarkdown(text, seen) }));

const LONG = `/draft?spec=${'eyJjb252ZW50aW9uIjp7_-'.repeat(100)}`;

describe('rendered, not raw', () => {
  test('bold, emphasis, code, lists, headings, tables', () => {
    const out = html(
      '# Title\n\n**Flower**: *soft* `id_1`\n\n- one\n- **two**\n\n1. first\n\n| a | b |\n|---|---|\n| 1 | 2 |',
    );
    expect(out).toContain('<h3>Title</h3>');
    expect(out).toContain('<strong>Flower</strong>: <em>soft</em> <code>id_1</code>');
    expect(out).toContain('<ul><li>one</li><li><strong>two</strong></li></ul>');
    expect(out).toContain('<ol><li>first</li></ol>');
    expect(out).toContain('<th>a</th>');
    expect(out).toContain('<td>2</td>');
    expect(out).not.toContain('**');
  });

  test('snake_case and addresses are not emphasis', () => {
    expect(html('see fig_top_k_share and a_b')).toBe(
      '<div class="md"><p>see fig_top_k_share and a_b</p></div>',
    );
  });
});

describe('the draft link', () => {
  test('a bare link is a short "Open the flower"; no base64 reaches the text', () => {
    const out = html(`**Flower**: ${LONG}\n\nmore`);
    expect(out).toContain('>Open the flower</a>');
    expect(out.match(/Open the flower/g)).toHaveLength(1);
    expect(out.replace(/href="[^"]*"/, '')).not.toContain('eyJj');
    expect(out).toContain(`href="${LONG}"`);
  });

  test('once, however the model wrote it: bare, linked, in code, in bold, across messages', () => {
    const seen = new Set<string>();
    const out = html(`${LONG}\n\n[see it](${LONG}) and \`${LONG}\` and **${LONG}**`, seen);
    expect(out.match(/Open the flower/g)).toHaveLength(1);
    expect(html(`again ${LONG}`, seen)).not.toContain('Open the flower');
  });

  test('two flowers in one message are two links; a full URL counts too', () => {
    const out = html(`${LONG} and http://localhost:3182/draft?spec=abc.`);
    expect(out.match(/Open the flower/g)).toHaveLength(2);
    expect(out).toContain('href="http://localhost:3182/draft?spec=abc"');
  });
});

describe('injected markup stays text', () => {
  test('HTML is escaped, never parsed', () => {
    const out = html('<img src=x onerror=alert(1)> <script>alert(2)</script> **<b>x</b>**');
    expect(out).not.toMatch(/<img|<script|<b>/);
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('only web links and site paths become links', () => {
    for (const bad of [
      '[x](javascript:alert(1))',
      '[x](JaVaScRiPt:alert(1))',
      '[x](data:text/html,hi)',
      '[x](//evil.example/a)',
      '[x](vbscript:y)',
    ]) {
      expect(html(bad)).not.toContain('href');
    }
    expect(html('[ok](https://near.org/a)')).toContain('href="https://near.org/a"');
    expect(html('[ok](/f/abc)')).toContain('href="/f/abc"');
    expect(html('go to https://near.org/a.')).toContain('href="https://near.org/a"');
  });

  test('an attribute cannot be broken out of', () => {
    const out = html('[x](https://a.example/"onmouseover="alert(1))');
    expect(out).not.toMatch(/ onmouseover=/);
  });
});
