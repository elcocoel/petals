// What a question is about, in the words sent to the model: plain text at its start, which the model
// can read and a reloaded thread can show. Only the words go back to the box if a send fails.
export type About =
  | { kind: 'account'; id: string; network: string; asOf: string }
  | { kind: 'group'; label: string; count?: number; network: string; asOf: string }
  | { kind: 'flower'; id: string; title: string; network: string; asOf: string };

const plain = (s: string) => s.replace(/[[\]]/g, '');

/** The whole prefix, brackets included. */
export function aboutLine(a: About): string {
  const where = `in the ${plain(a.network)} flower, data as of ${a.asOf.slice(0, 10)}`;
  switch (a.kind) {
    case 'account':
      return `[About account ${plain(a.id)}, ${where}]`;
    case 'group':
      return `[About ${plain(a.label)}${a.count === undefined ? '' : `, ${a.count} accounts grouped into one petal`}, ${where}]`;
    case 'flower':
      return `[About flower ${plain(a.id)}, "${plain(a.title)}", ${plain(a.network)}, data as of ${a.asOf.slice(0, 10)}]`;
  }
}

export const withAbout = (line: string, words: string) => `${line} ${words}`;

/** The same, as few words as the thread needs: who, not the bookkeeping the model reads. */
export function aboutLabel(line: string): string {
  const inner = line.replace(/^\[|\]$/g, '');
  const title = /^About flower [^,]+, "([^"]*)"/.exec(inner)?.[1];
  return title ? `About “${title}”` : (inner.split(',')[0] as string);
}

const PREFIX = /^\[(About [^\]]*)\]\s*/;

/** A sent text split back into what it was about (quiet in the thread) and the person's words. */
export function readAbout(sent: string): {
  about: string | null;
  flower: string | null;
  words: string;
} {
  const m = PREFIX.exec(sent);
  if (!m) return { about: null, flower: null, words: sent };
  const about = m[1] as string;
  return {
    about,
    flower: /^About flower ([^,\s]+)/.exec(about)?.[1] ?? null,
    words: sent.slice(m[0].length),
  };
}
