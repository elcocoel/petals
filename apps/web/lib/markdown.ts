// A small Markdown reader for the agent's answers (T166). It builds a tree that Markdown.tsx turns
// into React elements, so nothing the model writes is ever HTML: <img onerror=…> stays text. Links
// keep only http(s) and site paths. A draft link (about 2 KB of base64) is one "Open the flower".

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b' | 'i'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: Inline[] }
  | { t: 'flower'; href: string };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'pre'; v: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

const DRAFT = /^(?:https?:\/\/[^/\s]+)?\/draft\?(?:spec|flower)=/;
export const isDraftLink = (href: string) => DRAFT.test(href);

/** Only web links and paths on this site: no javascript:, data:, or //other.host. */
export const isSafeHref = (href: string) => /^https?:\/\//i.test(href) || /^\/(?!\/)/.test(href);

const LINK = /\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/y;
const BARE_URL = /(?:https?:\/\/|\/draft\?)[^\s<>()[\]`*]+/y;

function inline(text: string, seen: Set<string>): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ t: 'text', v: plain });
    plain = '';
  };
  /** A draft link once per `seen`; later ones are dropped. */
  const flower = (href: string) => {
    flush();
    if (seen.has(href)) return;
    seen.add(href);
    out.push({ t: 'flower', href });
  };
  const wordChar = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);

  for (let i = 0; i < text.length; ) {
    const ch = text[i] as string;
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        const v = text.slice(i + 1, end);
        if (isDraftLink(v.trim())) flower(v.trim());
        else {
          flush();
          out.push({ t: 'code', v });
        }
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      LINK.lastIndex = i;
      const m = LINK.exec(text);
      if (m) {
        const [whole, label = '', href = ''] = m;
        if (isDraftLink(href)) flower(href);
        else if (isSafeHref(href)) {
          flush();
          out.push({ t: 'a', href, c: inline(label, seen) });
        } else plain += label;
        i += whole.length;
        continue;
      }
    }
    if (ch === '*' || ch === '_') {
      const mark = text[i + 1] === ch ? ch + ch : ch;
      const end = text.indexOf(mark, i + mark.length);
      const inner = end > 0 ? text.slice(i + mark.length, end) : '';
      const edgesOk = ch === '*' || (!wordChar(text[i - 1]) && !wordChar(text[end + mark.length]));
      if (inner.trim() === inner && inner && edgesOk) {
        flush();
        out.push({ t: mark.length === 2 ? 'b' : 'i', c: inline(inner, seen) });
        i = end + mark.length;
        continue;
      }
    }
    if ((ch === 'h' || ch === '/') && !wordChar(text[i - 1])) {
      BARE_URL.lastIndex = i;
      const m = BARE_URL.exec(text);
      if (m) {
        const url = m[0].replace(/[.,;:!?'"]+$/, '');
        if (isDraftLink(url)) flower(url);
        else {
          flush();
          out.push({ t: 'a', href: url, c: [{ t: 'text', v: url }] });
        }
        i += url.length;
        continue;
      }
    }
    plain += ch;
    i++;
  }
  flush();
  return out;
}

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const ITEM = /^\s*(?:([-*+])|\d+[.)])\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** `seen`: draft links already shown; pass one Set per turn, so each flower's link shows once. */
export function parseMarkdown(text: string, seen: Set<string> = new Set()): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  const startsBlock = (l: string) =>
    FENCE.test(l) || HEADING.test(l) || RULE.test(l) || ITEM.test(l);
  for (let i = 0; i < lines.length; ) {
    const line = lines[i] as string;
    if (!line.trim()) {
      i++;
    } else if (FENCE.test(line)) {
      const body: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i] as string); i++) {
        body.push(lines[i] as string);
      }
      i++;
      out.push({ t: 'pre', v: body.join('\n') });
    } else if (RULE.test(line)) {
      out.push({ t: 'hr' });
      i++;
    } else if (HEADING.test(line)) {
      const m = line.match(HEADING) as RegExpMatchArray;
      out.push({ t: 'h', level: (m[1] as string).length, c: inline(m[2] as string, seen) });
      i++;
    } else if (line.includes('|') && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const head = cells(line).map((c) => inline(c, seen));
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && (lines[i] as string).includes('|'); i++) {
        rows.push(cells(lines[i] as string).map((c) => inline(c, seen)));
      }
      out.push({ t: 'table', head, rows });
    } else if (ITEM.test(line)) {
      const ordered = !(line.match(ITEM) as RegExpMatchArray)[1];
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i] as string;
        const m = l.match(ITEM);
        if (m && !m[1] === ordered) {
          items.push(m[2] as string);
          i++;
        } else if (!m && /^\s+\S/.test(l) && items.length) {
          items[items.length - 1] += `\n${l.trim()}`;
          i++;
        } else if (!l.trim() && (lines[i + 1] ?? '').match(ITEM)) {
          i++;
        } else break;
      }
      out.push({ t: ordered ? 'ol' : 'ul', items: items.map((x) => inline(x, seen)) });
    } else {
      const body: string[] = [];
      while (i < lines.length && (lines[i] as string).trim() && !startsBlock(lines[i] as string)) {
        body.push(lines[i] as string);
        i++;
      }
      out.push({ t: 'p', c: inline(body.join('\n'), seen) });
    }
  }
  return out;
}
