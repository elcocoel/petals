// Turning argv into a tool input, guided by the tool's input JSON Schema. No tool logic here.
//   --top-k 1,5,10   kebab-case flags fill snake_case fields; arrays take commas or JSON
//   --flag=value     the same as --flag value
//   --no-fresh       false for a boolean field
//   {...} @file -    JSON inline, from a file, or from stdin (object fields and --input)
import type { JSONSchema } from '@petal/tools';

/** A mistake in the command line: printed as a bad_input error, exit code 2. */
export class UsageError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'UsageError';
    this.hint = hint;
  }
}

export interface Io {
  readFile(path: string): string;
  readStdin(): Promise<string>;
}

export type FlagValue = string | boolean;

export interface Tokens {
  positionals: string[];
  /** snake_case name -> raw value, in order (the last one wins) */
  flags: [string, FlagValue][];
}

export const snake = (flag: string) => flag.replaceAll('-', '_');
export const kebab = (field: string) => field.replaceAll('_', '-');

/**
 * Splits argv into bare words and flags. Only `--x` tokens are flags, so `-` and negative
 * numbers are values. `isBoolean(name)` says which flags take no value.
 */
export function tokenize(argv: string[], isBoolean: (name: string) => boolean): Tokens {
  const positionals: string[] = [];
  const flags: [string, FlagValue][] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token === '-h') {
      flags.push(['help', true]);
      continue;
    }
    if (!token.startsWith('--') || token.length === 2) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      flags.push([snake(body.slice(0, eq)), body.slice(eq + 1)]);
      continue;
    }
    const name = snake(body);
    if (name.startsWith('no_') && isBoolean(name.slice(3))) {
      flags.push([name.slice(3), false]);
      continue;
    }
    if (isBoolean(name)) {
      flags.push([name, true]);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || (next.startsWith('--') && next.length > 2)) {
      throw new UsageError(`--${kebab(name)} needs a value`);
    }
    flags.push([name, next]);
    i++;
  }
  return { positionals, flags };
}

/** Follows a local `$ref` (`#/$defs/x`, `#/definitions/x`) inside the input schema. */
export function deref(schema: JSONSchema | undefined, root: JSONSchema): JSONSchema | undefined {
  let s = schema;
  for (let hops = 0; s && typeof s.$ref === 'string' && hops < 10; hops++) {
    const ref = s.$ref as string;
    if (!ref.startsWith('#/')) return s;
    let target: unknown = root;
    for (const part of ref.slice(2).split('/')) {
      target = (target as Record<string, unknown> | undefined)?.[part];
    }
    s = target as JSONSchema | undefined;
  }
  return s;
}

/** The top-level fields of an object schema; `root` resolves its `$ref`s. */
export function fields(schema: JSONSchema, root: JSONSchema = schema): Record<string, JSONSchema> {
  const s = deref(schema, root) ?? {};
  const props = s.properties;
  return props && typeof props === 'object' ? (props as Record<string, JSONSchema>) : {};
}

/** The JSON types a schema allows: from `type`, `anyOf`/`oneOf`, `enum` or `const`. */
export function typesOf(schema: JSONSchema | undefined, root: JSONSchema): Set<string> {
  const out = new Set<string>();
  const s = deref(schema, root);
  if (!s) return out;
  const t = s.type;
  if (typeof t === 'string') out.add(t);
  if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x);
  for (const key of ['anyOf', 'oneOf'] as const) {
    const alts = s[key];
    if (Array.isArray(alts)) for (const alt of alts) for (const x of typesOf(alt, root)) out.add(x);
  }
  const values = Array.isArray(s.enum) ? s.enum : 'const' in s ? [s.const] : [];
  for (const v of values)
    out.add(v === null ? 'null' : typeof v === 'number' ? 'number' : typeof v);
  if (out.has('integer')) out.add('number');
  return out;
}

const looksLikeJson = (raw: string) => /^\s*[[{]/.test(raw);

/** `{...}` inline, `@path` from a file, `-` from stdin. Undefined when it is none of these. */
export async function readJson(raw: string, io: Io): Promise<unknown> {
  let text: string;
  if (raw === '-') text = await io.readStdin();
  else if (raw.startsWith('@')) text = io.readFile(raw.slice(1));
  else if (looksLikeJson(raw)) text = raw;
  else return undefined;
  try {
    return JSON.parse(text);
  } catch (e) {
    const where = raw === '-' ? 'stdin' : raw.startsWith('@') ? raw.slice(1) : 'the argument';
    throw new UsageError(`${where} is not valid JSON: ${(e as Error).message}`);
  }
}

/** Turns one raw value into what the schema asks for. `label` names it in errors. */
export async function coerce(
  raw: FlagValue,
  schema: JSONSchema | undefined,
  root: JSONSchema,
  io: Io,
  label: string,
): Promise<unknown> {
  const types = typesOf(schema, root);
  if (typeof raw === 'boolean') {
    if (types.size === 0 || types.has('boolean')) return raw;
    throw new UsageError(`${label} needs a value`);
  }
  const structured = types.size === 0 || types.has('object') || types.has('array');
  if (structured) {
    const json = await readJson(raw, io);
    if (json !== undefined) return json;
  }
  if (types.has('array')) {
    const items = deref(schema, root)?.items as JSONSchema | undefined;
    return Promise.all(
      raw
        .split(',')
        .filter((x) => x !== '')
        .map((x) => coerce(x.trim(), items, root, io, label)),
    );
  }
  if (types.has('number') && /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(raw)) {
    const n = Number(raw);
    if (types.has('integer') && !types.has('string') && !Number.isInteger(n)) {
      throw new UsageError(`${label} must be a whole number, got ${raw}`);
    }
    return n;
  }
  if (types.has('boolean') && !types.has('string')) {
    if (['true', '1', 'yes'].includes(raw)) return true;
    if (['false', '0', 'no'].includes(raw)) return false;
    throw new UsageError(`${label} must be true or false, got ${raw}`);
  }
  if (types.size > 0 && !types.has('string')) {
    const want = [...types].filter((t) => t !== 'null').join(' or ');
    throw new UsageError(`${label} must be ${want}, got ${raw}`);
  }
  return raw;
}
