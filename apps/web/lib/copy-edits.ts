// A page's words written straight on the page, as a JSON of edits. A page's words stay in their own file; the
// words typed on the page are kept beside it as a JSON of a field's path to its words ("backIt.ways.3.title":
// "…"), and win.
// These two functions are the whole of it: list a copy's words by path, and lay the edits over it.

type Copy = { readonly [key: string]: unknown } | readonly unknown[];

/** Every string in a copy object, by its dotted path (an array's items by their index). */
export function copyLeaves(copy: unknown, at = ''): [path: string, words: string][] {
  if (typeof copy === 'string') return [[at, copy]];
  if (copy === null || typeof copy !== 'object') return [];
  return Object.entries(copy).flatMap(([key, value]) =>
    copyLeaves(value, at ? `${at}.${key}` : key),
  );
}

/** The copy with each edit laid over the string at its path. A path that isn't a string in it is left out. */
export function withEdits<T extends Copy>(copy: T, edits: Readonly<Record<string, string>>): T {
  const at = (value: unknown, path: string): unknown => {
    if (typeof value === 'string') return path in edits ? edits[path] : value;
    if (Array.isArray(value)) return value.map((v, i) => at(v, path ? `${path}.${i}` : String(i)));
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, at(v, path ? `${path}.${k}` : k)]),
      );
    return value;
  };
  return at(copy, '') as T;
}
