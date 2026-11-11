// Petals' formats on the person's computer (#98; Elco, 11 Nov: "the petals agent shouldn't be strictly
// necessary to write in the correct data format"). validate_data checks a document against the format its
// `petal` field names, with core's own checks, the same ones Petals runs when it's kept, so an agent hears
// what's wrong before it sends anything. It writes nothing. The schemas are at <site>/schema/<format>/<version>.json.
import {
  canonicalJson,
  checkLayer,
  layerHash,
  sha256Hex,
  validateClaim,
  validateMark,
  validateProposals,
  validateSnapshot,
  validateValue,
} from '@petal/core';
import type { Tool } from '@petal/tools';

type Json = Record<string, unknown>;
type Issue = { path: string; message: string };
type Checked = { ok: true } | { ok: false; errors: Issue[] };

const fromResult = (r: { ok: boolean; errors?: { path?: string; message: string }[] }): Checked =>
  r.ok
    ? { ok: true }
    : {
        ok: false,
        errors: (r.errors ?? []).map((e) => ({ path: e.path ?? '', message: e.message })),
      };

/** The checks by a format's name; each reads every version it knows. */
const CHECKS: Record<string, (x: unknown) => Checked> = {
  snapshot: (x) => fromResult(validateSnapshot(x)),
  layer: (x) => {
    try {
      checkLayer(x);
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [{ path: '', message: (e as Error).message }] };
    }
  },
  // as in the person's own project, where names of people are allowed (people.ts)
  claim: (x) => fromResult(validateClaim(x, { private: true })),
  mark: (x) => fromResult(validateMark(x)),
  proposals: (x) => fromResult(validateProposals(x)),
  value: (x) => fromResult(validateValue(x)),
};

const nameOf = (doc: Json): string | null => {
  const petal = typeof doc.petal === 'string' ? doc.petal : '';
  return /^[a-z][a-zA-Z0-9-]*\/v\d+$/.test(petal) ? (petal.split('/')[0] as string) : null;
};

/** What `validate_data` answers for one document. */
export function validateData(doc: unknown): Json {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: [{ path: '', message: 'A document is a JSON object.' }] };
  }
  const d = doc as Json;
  const name = nameOf(d);
  if (!name) {
    return {
      ok: false,
      errors: [
        { path: '/petal', message: 'petal names the format and its version, such as layer/v1.' },
      ],
    };
  }
  if (name === 'seam') {
    return {
      format: d.petal,
      ok: false,
      errors: [
        {
          path: '/petal',
          message: 'A seam is made by compose_view from a reading and its layers, never by hand.',
        },
      ],
    };
  }
  const check = CHECKS[name];
  if (!check) {
    return {
      format: d.petal,
      ok: false,
      errors: [
        {
          path: '/petal',
          message: `There's no check here for ${String(d.petal)}. These are: ${Object.keys(CHECKS).join(', ')}.`,
        },
      ],
    };
  }
  const out = check(d);
  // a document's name: a layer's own hash, else the SHA-256 of its RFC 8785 canonical JSON
  const sha256 =
    name === 'layer' && out.ok
      ? layerHash(d as never)
      : sha256Hex(new TextEncoder().encode(canonicalJson(d)));
  return out.ok
    ? { format: d.petal, ok: true, sha256 }
    : { format: d.petal, ok: false, sha256, errors: out.errors };
}

export const validateDataTool: Tool<{ document: unknown }, Json> & {
  title: string;
  description: string;
  annotations: object;
} = {
  name: 'validate_data',
  title: 'Check a document against its format',
  description:
    "Check a document Petals keeps, a snapshot, layer, claim, mark, proposals or value, against the format its petal field names (such as layer/v1), with the same checks Petals runs when it's kept. It answers ok, what's wrong if not, and the document's sha256. It writes nothing and runs on this computer. The formats are at the site's /schema.",
  input: {
    type: 'object',
    required: ['document'],
    additionalProperties: false,
    properties: {
      document: { type: 'object', description: 'the document, whose petal field names its format' },
    },
  },
  output: {
    type: 'object',
    required: ['ok'],
    properties: {
      format: { type: 'string' },
      ok: { type: 'boolean' },
      sha256: { type: 'string' },
      errors: { type: 'array', items: { type: 'object' } },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: async ({ document }) => validateData(document),
};
