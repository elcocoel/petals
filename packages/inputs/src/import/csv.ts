// A small streaming CSV reader (RFC 4180: quoted fields, "" escapes, newlines inside quotes),
// for the spike tables that are too large to load at once.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

/** Split one CSV record. Returns null while a quoted field is still open. */
export function parseRecord(text: string): string[] | null {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  if (quoted) return null;
  out.push(field);
  return out;
}

/** Rows of a CSV file with a header line, as objects keyed by column name. */
export async function* readCsv(path: string): AsyncGenerator<Record<string, string>> {
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let header: string[] | null = null;
  let pending = '';
  for await (const line of lines) {
    const text = pending ? `${pending}\n${line}` : line;
    const rec = parseRecord(text);
    if (rec === null) {
      pending = text;
      continue;
    }
    pending = '';
    if (!header) {
      header = rec;
      continue;
    }
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i] as string] = rec[i] ?? '';
    yield row;
  }
  if (pending) throw new Error(`readCsv: unterminated quoted field at the end of ${path}`);
}
