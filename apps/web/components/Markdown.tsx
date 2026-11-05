// The tree from lib/markdown.ts as React elements. Text goes in as text: there is no path by which
// the model's words become HTML.
import { createElement, type ReactNode } from 'react';
import type { Block, Inline } from '../lib/markdown.ts';

function spans(c: Inline[]): ReactNode[] {
  return c.map((x, i) => {
    switch (x.t) {
      case 'text':
        return x.v;
      case 'b':
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        return <strong key={i}>{spans(x.c)}</strong>;
      case 'i':
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        return <em key={i}>{spans(x.c)}</em>;
      case 'code':
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        return <code key={i}>{x.v}</code>;
      case 'a':
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
          <a key={i} href={x.href} rel="noreferrer">
            {spans(x.c)}
          </a>
        );
      case 'flower':
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
          <a key={i} href={x.href} target="_blank" rel="noreferrer">
            Open the flower
          </a>
        );
      default:
        return null;
    }
  });
}

function block(b: Block, key: number): ReactNode {
  switch (b.t) {
    case 'p':
      return <p key={key}>{spans(b.c)}</p>;
    case 'h':
      // the page has h1 and h2 of its own
      return createElement(`h${Math.min(b.level + 2, 6)}`, { key }, spans(b.c));
    case 'ul':
    case 'ol':
      return createElement(
        b.t,
        { key },
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        b.items.map((c, i) => <li key={i}>{spans(c)}</li>),
      );
    case 'pre':
      return (
        <pre key={key}>
          <code>{b.v}</code>
        </pre>
      );
    case 'hr':
      return <hr key={key} />;
    case 'table':
      return (
        <table key={key}>
          <thead>
            <tr>
              {b.head.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
                <th key={i}>{spans(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
              <tr key={i}>
                {r.map((c, k) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
                  <td key={k}>{spans(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

export function Markdown({ blocks }: { blocks: Block[] }) {
  return <div className="md">{blocks.map(block)}</div>;
}
