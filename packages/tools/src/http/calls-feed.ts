// The open-calls feed as RSS 2.0 (Elco, 12 Nov: the feed served as RSS, JSON and MCP): any feed reader
// becomes a watcher, with the filters in the address (?kind=, ?q=, ?closes_before=). Each item is one calls/v1.
import type { Call } from '@petal/core';

const xml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** One call's facts, as its source says them, in plain words. */
function said(c: Call): string {
  return [
    c.summary,
    `Offered by ${c.offered_by.name}.`,
    c.closes ? `Closes ${c.closes.slice(0, 10)}.` : null,
    c.status ? `Status: ${c.status}.` : null,
    c.budget ? `Budget: ${c.budget}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The feed at `self` (its own address, filters and all), for the site at `site`. */
export function callsRss(calls: readonly Call[], site: string, self: string): string {
  const items = calls.map((c) =>
    [
      '    <item>',
      `      <title>${xml(c.title)}</title>`,
      `      <link>${xml(c.link)}</link>`,
      `      <guid isPermaLink="false">${xml(c.id)}</guid>`,
      `      <category>${xml(c.kind)}</category>`,
      `      <description>${xml(said(c))}</description>`,
      `      <pubDate>${new Date(c.opens ?? c.source.read_at).toUTCString()}</pubDate>`,
      '    </item>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Petals: open calls</title>',
    `    <link>${xml(site)}</link>`,
    '    <description>Open RFPs, grants programs, bounties, hackathons, accelerators and funds, closing soonest first, each as its source says it.</description>',
    `    <atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
