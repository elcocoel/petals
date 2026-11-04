// T056: signatures and attestation reports, on faked HTTP only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schemas, sha256Hex } from '@petal/core';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, test } from 'vitest';
import {
  attestationStore,
  buildSignature,
  checkSignature,
  fetchAttestation,
  fetchSignature,
  type NearAiHttp,
} from '../src/signature.ts';
import { fakeSignature, SIGNER, tmpRoot } from './helpers.ts';

const validSignature = (() => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormatsModule.default(ajv);
  return ajv.compile({
    ...(schemas.entry as object),
    $id: 'urn:test:model-signature',
    $ref: '#/$defs/modelSignature',
  });
})();

const http = (f: typeof fetch): NearAiHttp => ({
  baseURL: 'https://near-ai.test/v1',
  apiKey: 'k',
  fetch: f,
});

describe('attestationStore', () => {
  test('keeps bytes under their SHA-256 and gives them back unchanged', () => {
    const store = attestationStore(join(tmpRoot(), 'attestations'));
    const bytes = new TextEncoder().encode('{"b":1,  "a":[2]}\n');
    const sha = store.put(bytes);
    expect(sha).toBe(sha256Hex(bytes));
    expect(store.get(sha)).toEqual(bytes);
    expect(readFileSync(join(store.dir, `${sha}.json`))).toEqual(Buffer.from(bytes));
    expect(store.get('../../etc/passwd')).toBeNull();
    expect(store.get('0'.repeat(64))).toBeNull();
  });
});

describe('fetchAttestation', () => {
  test('asks for a report bound to a fresh 32-byte nonce and stores it byte for byte', async () => {
    const report = new TextEncoder().encode(
      JSON.stringify({ model_attestations: [{ signing_address: SIGNER }] }),
    );
    let seen: URL | undefined;
    let headers: Headers | undefined;
    const store = attestationStore(join(tmpRoot(), 'attestations'));
    const ref = await fetchAttestation(
      http(async (u, init) => {
        seen = new URL(String(u));
        headers = new Headers(init?.headers);
        return new Response(report);
      }),
      'z-ai/glm-5.3-flash',
      store,
      { apiBase: 'https://petal.example' },
    );
    expect(seen?.pathname).toBe('/v1/attestation/report');
    expect(seen?.searchParams.get('model')).toBe('z-ai/glm-5.3-flash');
    expect(seen?.searchParams.get('nonce')).toMatch(/^[0-9a-f]{64}$/);
    expect(seen?.searchParams.get('nonce')).toBe(ref.nonce);
    expect(headers?.get('authorization')).toBe('Bearer k');
    expect(headers?.get('x-no-aliasing')).toBe('true');
    expect(ref.report_sha256).toBe(sha256Hex(report));
    expect(ref.report_url).toBe(`https://petal.example/api/v1/attestations/${ref.report_sha256}`);
    expect(ref.signing_addresses).toEqual([SIGNER]);
    expect(store.get(ref.report_sha256)).toEqual(report);
  });

  test('a failed report is an error, and nothing is stored', async () => {
    const store = attestationStore(join(tmpRoot(), 'attestations'));
    await expect(
      fetchAttestation(
        http(async () => new Response('no', { status: 503 })),
        'm',
        store,
      ),
    ).rejects.toThrow(/HTTP 503/);
  });
});

describe('fetchSignature', () => {
  const raw = { text: 'm:a:b', signature: '0xsig', signing_address: SIGNER, signing_algo: 'ecdsa' };

  test('retries a 404 (a race right after the call), then returns the signature', async () => {
    let n = 0;
    const got = await fetchSignature(
      http(async (u) => {
        expect(String(u)).toBe(
          'https://near-ai.test/v1/signature/chatcmpl-1?model=m&signing_algo=ecdsa',
        );
        return ++n < 3 ? new Response('', { status: 404 }) : Response.json(raw);
      }),
      'chatcmpl-1',
      'm',
      { wait: async () => {} },
    );
    expect(n).toBe(3);
    expect(got).toEqual(raw);
  });

  test('gives up at once on a refused key, and after its tries on 404', async () => {
    let n = 0;
    const count = (status: number) =>
      http(async () => {
        n++;
        return new Response('', { status });
      });
    await expect(fetchSignature(count(401), 'c', 'm', { wait: async () => {} })).rejects.toThrow(
      /401/,
    );
    expect(n).toBe(1);
    n = 0;
    await expect(
      fetchSignature(count(404), 'c', 'm', { delaysMs: [1, 1], wait: async () => {} }),
    ).rejects.toThrow(/404/);
    expect(n).toBe(3);
  });
});

describe('buildSignature and checkSignature', () => {
  const req = 'a'.repeat(64);
  const res = 'b'.repeat(64);
  const make = (text: string, kind?: string, address = SIGNER) =>
    buildSignature({
      model: 'z-ai/glm-5.3-flash',
      completion_id: 'chatcmpl-1',
      raw: { text, signature: '0xsig', signing_address: address, signature_kind: kind },
      request_sha256: req,
      response_sha256: res,
      attestation: {
        nonce: 'n'.repeat(64),
        report_sha256: 'c'.repeat(64),
        report_url: `/api/v1/attestations/${'c'.repeat(64)}`,
        signing_addresses: [SIGNER],
      },
      fetched_at: new Date('2026-11-04T12:00:00Z'),
    });

  test('builds a ModelSignature that the flower schema accepts', () => {
    const sig = make(`z-ai/glm-5.3-flash:${req}:${res}`, 'provider_tee');
    expect(validSignature(sig), JSON.stringify(validSignature.errors)).toBe(true);
    expect(sig).toMatchObject({
      provider: 'near-ai-cloud',
      signature_kind: 'provider_tee',
      signing_algo: 'ecdsa',
      attestation: { report_sha256: 'c'.repeat(64) },
    });
    expect(sig.attestation).not.toHaveProperty('signing_addresses');
    expect(validSignature(fakeSignature('x'))).toBe(true);
  });

  test('a provider_tee signature over our own hashes, by an attested signer, has no problems', () => {
    const sig = make(`z-ai/glm-5.3-flash:${req}:${res}`);
    expect(sig.signature_kind).toBe('provider_tee');
    expect(checkSignature(sig, [SIGNER.toUpperCase()])).toEqual([]);
  });

  test('names what is off: other hashes, a gateway signature, an unattested signer', () => {
    expect(checkSignature(make(`z-ai/glm-5.3-flash:${req}:${'f'.repeat(64)}`))).toHaveLength(1);
    const gateway = make(`${req}:${res}`);
    expect(gateway.signature_kind).toBe('gateway');
    expect(checkSignature(gateway).join(' ')).toMatch(/does not prove which model/);
    expect(
      checkSignature(make(`z-ai/glm-5.3-flash:${req}:${res}`, undefined, '0xother'), [SIGNER]),
    ).toEqual(['the signing address is not one the attestation report names']);
  });
});
