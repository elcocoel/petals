// Model signatures from NEAR AI Cloud (T056; research R10).
//
// A non-streamed Chat Completions call with the canonical model id and `x-no-aliasing: true`
// gets a `provider_tee` signature over "model:sha256(request):sha256(response)", signed inside
// the model's enclave. Petal fetches the attestation report BEFORE the completion (the docs say
// not to use one fetched after), and `GET /v1/signature/{id}` right after it (retention is not
// documented). Both endpoints need a key, so the report is kept byte for byte in
// .petal/attestations/<report_sha256>.json and served to anyone at
// /api/v1/attestations/<report_sha256> (http-api.md).
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '@petal/core';
import type { ModelSignature } from '@petal/core/types';

const SHA256 = /^[0-9a-f]{64}$/;

/** Content-addressed attestation reports: the file name is the SHA-256 of the exact bytes. */
export interface AttestationStore {
  readonly dir: string;
  put(bytes: Uint8Array): string;
  get(sha256: string): Uint8Array<ArrayBuffer> | null;
}

export function attestationStore(dir: string): AttestationStore {
  return {
    dir,
    put(bytes) {
      const sha = sha256Hex(bytes);
      mkdirSync(dir, { recursive: true });
      const tmp = join(dir, `.${sha}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
      writeFileSync(tmp, bytes);
      renameSync(tmp, join(dir, `${sha}.json`));
      return sha;
    },
    get(sha) {
      if (!SHA256.test(sha)) return null;
      try {
        return new Uint8Array(readFileSync(join(dir, `${sha}.json`)));
      } catch {
        return null;
      }
    },
  };
}

/** What a signature carries about the report fetched before the completion. */
export interface AttestationRef {
  nonce: string;
  report_sha256: string;
  report_url: string;
  /** signing addresses the report attests (model_attestations[].signing_address) */
  signing_addresses: string[];
}

/** The minimal HTTP the two signature endpoints need. */
export interface NearAiHttp {
  baseURL: string;
  apiKey: string;
  fetch: typeof fetch;
}

function authHeaders(http: NearAiHttp): Record<string, string> {
  return {
    Authorization: `Bearer ${http.apiKey}`,
    Accept: 'application/json',
    'Accept-Encoding': 'identity',
    'x-no-aliasing': 'true',
  };
}

/** A fresh 32-byte nonce, as 64 hex characters (NEAR AI's report binds it in TDX report_data). */
export function attestationNonce(): string {
  return randomBytes(32).toString('hex');
}

function signingAddresses(report: unknown): string[] {
  const list = (report as { model_attestations?: unknown } | null)?.model_attestations;
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => (a as { signing_address?: unknown }).signing_address)
    .filter((a): a is string => typeof a === 'string');
}

/**
 * `GET /v1/attestation/report` before the completion. Keeps the exact bytes in the store.
 * The query was checked live on all three models in T060.
 */
export async function fetchAttestation(
  http: NearAiHttp,
  model: string,
  store: AttestationStore,
  o: { apiBase?: string; nonce?: string } = {},
): Promise<AttestationRef> {
  const nonce = o.nonce ?? attestationNonce();
  const q = new URLSearchParams({
    model,
    provider: 'near',
    signing_algo: 'ecdsa',
    nonce,
    include_tls_fingerprint: 'false',
  });
  const res = await http.fetch(`${http.baseURL}/attestation/report?${q}`, {
    headers: authHeaders(http),
  });
  if (!res.ok) throw new Error(`attestation report: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('attestation report: not JSON');
  }
  const report_sha256 = store.put(bytes);
  return {
    nonce,
    report_sha256,
    report_url: `${o.apiBase ?? ''}/api/v1/attestations/${report_sha256}`,
    signing_addresses: signingAddresses(parsed),
  };
}

/** What `GET /v1/signature/{id}` returns. */
export interface RawSignature {
  text: string;
  signature: string;
  signing_address: string;
  signing_algo?: string;
  signature_kind?: string;
}

function isRawSignature(x: unknown): x is RawSignature {
  const s = x as Partial<RawSignature> | null;
  return (
    !!s &&
    typeof s.text === 'string' &&
    typeof s.signature === 'string' &&
    s.signature.length > 0 &&
    typeof s.signing_address === 'string'
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `GET /v1/signature/{completion_id}` right after the completion. A 404 just after the call is
 * usually a race, so it retries a few times with a short backoff.
 */
export async function fetchSignature(
  http: NearAiHttp,
  completionId: string,
  model: string,
  o: { delaysMs?: number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<RawSignature> {
  const delays = o.delaysMs ?? [300, 700, 1500];
  const wait = o.wait ?? sleep;
  const q = new URLSearchParams({ model, signing_algo: 'ecdsa' });
  const url = `${http.baseURL}/signature/${encodeURIComponent(completionId)}?${q}`;
  let last = '';
  for (let i = 0; i <= delays.length; i++) {
    const res = await http.fetch(url, { headers: authHeaders(http) });
    if (res.ok) {
      const body: unknown = await res.json().catch(() => null);
      if (isRawSignature(body)) return body;
      last = 'no signature in the answer';
    } else {
      last = `HTTP ${res.status}`;
      // only a missing (not yet stored) signature or a server hiccup is worth another try
      if (res.status !== 404 && res.status < 500) break;
    }
    const d = delays[i];
    if (d === undefined) break;
    await wait(d);
  }
  throw new Error(`signature for ${completionId}: ${last}`);
}

/** provider_tee signs "model:req:res"; gateway signs "req:res" and does not prove the model. */
function kindOf(raw: RawSignature): ModelSignature['signature_kind'] {
  if (raw.signature_kind === 'provider_tee' || raw.signature_kind === 'gateway') {
    return raw.signature_kind;
  }
  return raw.text.split(':').length >= 3 ? 'provider_tee' : 'gateway';
}

export function buildSignature(o: {
  model: string;
  completion_id: string;
  raw: RawSignature;
  request_sha256: string;
  response_sha256: string;
  attestation?: AttestationRef;
  fetched_at: Date;
}): ModelSignature {
  const sig: ModelSignature = {
    provider: 'near-ai-cloud',
    model: o.model,
    completion_id: o.completion_id,
    signature_kind: kindOf(o.raw),
    text: o.raw.text,
    signature: o.raw.signature,
    signing_address: o.raw.signing_address,
    signing_algo: o.raw.signing_algo === 'ed25519' ? 'ed25519' : 'ecdsa',
    request_sha256: o.request_sha256,
    response_sha256: o.response_sha256,
    fetched_at: o.fetched_at.toISOString(),
  };
  if (o.attestation) {
    sig.attestation = {
      nonce: o.attestation.nonce,
      report_sha256: o.attestation.report_sha256,
      report_url: o.attestation.report_url,
    };
  }
  return sig;
}

/**
 * Cheap checks Petal can make without a crypto library: the signed text names our model and our
 * own hashes, and the signer is one the report attests. An empty list means nothing is off.
 * (Recovering the ECDSA signer, TDX and NRAS checks are for an offline verifier.)
 */
export function checkSignature(sig: ModelSignature, attestedAddresses?: string[]): string[] {
  const problems: string[] = [];
  const pair = `${sig.request_sha256}:${sig.response_sha256}`;
  if (sig.signature_kind === 'provider_tee') {
    if (sig.text !== `${sig.model}:${pair}`) {
      problems.push('the signed text is not model:sha256(request):sha256(response) for this call');
    }
  } else {
    problems.push('gateway signature: it does not prove which model answered');
    if (sig.text !== pair) problems.push('the signed text does not match this call');
  }
  if (attestedAddresses?.length) {
    const want = sig.signing_address.toLowerCase();
    if (!attestedAddresses.some((a) => a.toLowerCase() === want)) {
      problems.push('the signing address is not one the attestation report names');
    }
  }
  return problems;
}
