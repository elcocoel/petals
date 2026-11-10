// The tree from lib/markdown.ts as React elements. Text goes in as text: there is no path by which
// the model's words become HTML.
import { createElement, type ReactNode } from 'react';
import type { Block, Inline } from '../lib/markdown.ts';

/** A link the page can handle itself: true means it did. A modified click stays the browser's. */
type OnLink = (href: string) => boolean;

function spans(c: Inline[], onLink?: OnLink): ReactNode[] {
  return c.map((x, i) => {
    switch (x.t) {
      case 'text':
        return x.v;
      case 'b':
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        return <strong key={i}>{spans(x.c, onLink)}</strong>;
      case 'i':
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        return <em key={i}>{spans(x.c, onLink)}</em>;
      case 'code':
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        return <code key={i}>{x.v}</code>;
      case 'a':
        return (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
            key={i}
            href={x.href}
            rel="noreferrer"
            onClick={
              onLink &&
              ((e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                if (onLink(x.href)) e.preventDefault();
              })
            }
          >
            {spans(x.c, onLink)}
          </a>
        );
      case 'flower':
        return (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
            key={i}
            href={x.href}
            target="_blank"
            rel="noreferrer"
            // where the page can open it in place (the workspace's canvas), it does, and stays (Elco, 10 Nov)
            onClick={
              onLink &&
              ((e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                if (onLink(x.href)) e.preventDefault();
              })
            }
          >
            Open the flower
          </a>
        );
      default:
        return null;
    }
  });
}

function block(b: Block, key: number, onLink?: OnLink): ReactNode {
  switch (b.t) {
    case 'p':
      return <p key={key}>{spans(b.c, onLink)}</p>;
    case 'h':
      // the page has h1 and h2 of its own
      return createElement(`h${Math.min(b.level + 2, 6)}`, { key }, spans(b.c, onLink));
    case 'ul':
    case 'ol':
      return createElement(
        b.t,
        { key },
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        b.items.map((c, i) => <li key={i}>{spans(c, onLink)}</li>),
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
                <th key={i}>{spans(c, onLink)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
              <tr key={i}>
                {r.map((c, k) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
                  <td key={k}>{spans(c, onLink)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

export function Markdown({ blocks, onLink }: { blocks: Block[]; onLink?: OnLink | undefined }) {
  return <div className="md">{blocks.map((b, i) => block(b, i, onLink))}</div>;
}
