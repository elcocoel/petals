// A web page as plain text, its links and the addresses in it (T333). A scanner rather than regular
// expressions over the whole page, so a page can't make it slow, and nothing in a page runs.

const SKIP = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'title',
  'iframe',
  'object',
]);
const BREAK = new Set(
  'address article aside blockquote br dd details div dl dt figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section summary table td th tr ul'.split(
    ' ',
  ),
);
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (all, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return NAMED[body.toLowerCase()] ?? all;
  });
}

const attribute = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null;
};

const tidy = (text: string) =>
  text
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export interface PageText {
  title: string | null;
  text: string;
  links: { url: string; text: string }[];
}

const MAX_LINKS = 100;

export function htmlToText(html: string, base?: string): PageText {
  const lower = html.toLowerCase();
  const out: string[] = [];
  const links: PageText['links'] = [];
  let title: string | null = null;
  let link: { url: string; from: number } | null = null;
  const closeLink = () => {
    if (!link) return;
    const text = tidy(decodeEntities(out.slice(link.from).join(''))).replace(/\n/g, ' ');
    if (links.length < MAX_LINKS) links.push({ url: link.url, text: text.slice(0, 200) });
    link = null;
  };
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf('<', at);
    if (open < 0) {
      out.push(html.slice(at));
      break;
    }
    out.push(html.slice(at, open));
    if (lower.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      at = end < 0 ? html.length : end + 3;
      continue;
    }
    const close = html.indexOf('>', open + 1);
    if (close < 0) break;
    const tag = html.slice(open, close + 1);
    const name = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag)?.[1]?.toLowerCase();
    at = close + 1;
    if (!name) continue;
    const closing = tag[1] === '/';
    if (!closing && name === 'title' && title === null) {
      const end = lower.indexOf('</title', at);
      if (end >= 0) title = tidy(decodeEntities(html.slice(at, end)));
    }
    if (!closing && SKIP.has(name)) {
      const end = lower.indexOf(`</${name}`, at);
      if (end < 0) break;
      const after = html.indexOf('>', end);
      at = after < 0 ? html.length : after + 1;
      continue;
    }
    if (name === 'a') {
      closeLink();
      if (!closing) {
        const href = attribute(tag, 'href');
        if (href) {
          try {
            const url = new URL(href, base);
            if (url.protocol === 'http:' || url.protocol === 'https:')
              link = { url: url.toString(), from: out.length };
          } catch {
            // not a link worth keeping
          }
        }
      }
    }
    if (BREAK.has(name)) out.push('\n');
    else if (name === 'td' || name === 'th') out.push(' ');
  }
  closeLink();
  return { title, text: tidy(decodeEntities(out.join(''))), links };
}

const ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const MAX_ADDRESSES = 60;

/** Every address in a page, links and tags included, once each, in the order they come. */
export function addressesIn(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(ADDRESS)) {
    seen.add(m[0].toLowerCase());
    if (seen.size >= MAX_ADDRESSES) break;
  }
  return [...seen];
}
