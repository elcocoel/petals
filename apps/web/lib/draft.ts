// The draft view's link: /draft?spec=<base64url of the spec's JSON>. A draft is a flower from its
// spec alone, not published (tools.md render_flower, view_url). W4's view_url must use the same
// encoding; decodeDraft also takes plain JSON, so a hand-made link works too.
import type { Spec } from '@petal/core/types';

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function encodeDraft(spec: Spec): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(spec)));
}

export function draftUrl(spec: Spec): string {
  return `/draft?spec=${encodeDraft(spec)}`;
}

/** The spec in a /draft?spec= value, or why it can't be read. Only the shape is checked here. */
export function decodeDraft(
  param: string,
): { ok: true; spec: Spec } | { ok: false; error: string } {
  let value: unknown;
  try {
    const text = param.trimStart().startsWith('{')
      ? param
      : new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(param.trim()));
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'the spec in this link is not base64url JSON or JSON' };
  }
  const spec = value as Partial<Spec> | null;
  if (!spec || typeof spec !== 'object' || spec.petal !== 'spec/v1') {
    return { ok: false, error: 'the link does not hold a spec/v1 document' };
  }
  return { ok: true, spec: spec as Spec };
}
