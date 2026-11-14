// The tree from lib/markdown.ts as React elements. Text goes in as text: there is no path by which
// the model's words become HTML. `app` is the conversation's scale: code in Mono, a heading no
// bigger than the words, a table in UI.
import { createElement, type ReactNode } from 'react';
import type { Block, Inline } from '../lib/markdown.ts';
import { outside } from '../lib/outside.ts';

/** A link the page can handle itself: true means it did. A modified click stays the browser's. */
type OnLink = (href: string) => boolean;

/** The app's sizes for what the page's base styles draw at the landing's (apps/web/app/globals.css). */
const APP = {
  code: 'type-mono',
  h: 'mt-space-16 mb-space-8 type-ui font-semibold',
  table: 'type-ui',
} as const;

function spans(c: Inline[], onLink?: OnLink, app = false): ReactNode[] {
  return c.map((x, i) => {
    switch (x.t) {
      case 'text':
        return x.v;
      case 'b':
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        return <strong key={i}>{spans(x.c, onLink, app)}</strong>;
      case 'i':
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        return <em key={i}>{spans(x.c, onLink, app)}</em>;
      case 'code':
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
          <code key={i} className={app ? APP.code : undefined}>
            {x.v}
          </code>
        );
      case 'a':
        return (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
            key={i}
            href={x.href}
            {...outside(x.href)}
            onClick={
              onLink &&
              ((e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                if (onLink(x.href)) e.preventDefault();
              })
            }
          >
            {spans(x.c, onLink, app)}
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
            // where the page can open it in place (the workspace's canvas), it does, and stays
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

function block(b: Block, key: number, onLink?: OnLink, app = false): ReactNode {
  switch (b.t) {
    case 'p':
      return <p key={key}>{spans(b.c, onLink, app)}</p>;
    case 'h':
      // the page has h1 and h2 of its own
      return createElement(
        `h${Math.min(b.level + 2, 6)}`,
        { key, className: app ? APP.h : undefined },
        spans(b.c, onLink, app),
      );
    case 'ul':
    case 'ol':
      return createElement(
        b.t,
        { key },
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
        b.items.map((c, i) => <li key={i}>{spans(c, onLink, app)}</li>),
      );
    case 'pre':
      return (
        <pre key={key} className={app ? APP.code : undefined}>
          <code className={app ? APP.code : undefined}>{b.v}</code>
        </pre>
      );
    case 'hr':
      return <hr key={key} />;
    case 'table':
      return (
        <table key={key} className={app ? APP.table : undefined}>
          <thead>
            <tr>
              {b.head.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
                <th key={i}>{spans(c, onLink, app)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
              <tr key={i}>
                {r.map((c, k) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a parsed text never reorders
                  <td key={k}>{spans(c, onLink, app)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

export function Markdown({
  blocks,
  onLink,
  app = false,
}: {
  blocks: Block[];
  onLink?: OnLink | undefined;
  /** At the app's scale, as the conversation is. */
  app?: boolean;
}) {
  return <div className="md">{blocks.map((b, i) => block(b, i, onLink, app))}</div>;
}
