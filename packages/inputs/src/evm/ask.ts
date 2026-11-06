// Asking a chain one thing, quickly, through the endpoints we list (T330). Used where an answer is
// wanted in seconds, for a person waiting in a chat. The paced pool in ../rpc/pool.ts is for long reads.
//
// An endpoint that doesn't answer says nothing about what was asked, so this tries the next one, and
// when none answers it throws ChainDown, which a caller must report as down and never as "not there".
// A revert is an answer from a healthy node, so it is thrown at once as Reverted.
//
// Only URLs from chains.ts ever reach this: nothing a person or a model says can name an endpoint.
import { runSignal } from '@petal/core';
import { endpointHealth, HANG_PAUSE_MS } from '../rpc/pool.ts';
import type { EvmChain } from './chains.ts';

export const ASK_TIMEOUT_MS = 4000;
const USER_AGENT = 'petal/0.1 (keyless reads)';

export interface EndpointFailure {
  url: string;
  why: string;
}

export interface AskOptions {
  fetch?: typeof globalThis.fetch;
  /** each endpoint gets this long, default ASK_TIMEOUT_MS */
  timeoutMs?: number;
  /** which endpoints look down, default the process's own; an injected fetch gets its own */
  health?: Map<string, number>;
  /** reject an answer and try the next endpoint: an empty multicall, say */
  accept?: (result: unknown) => boolean;
}

/** None of a chain's endpoints answered. This says nothing about what was asked. */
export class ChainDown extends Error {
  readonly chain: string;
  readonly failures: EndpointFailure[];
  constructor(chain: string, failures: EndpointFailure[]) {
    super(
      `${chain} did not answer just now: ${failures.map((f) => `${new URL(f.url).host}: ${f.why}`).join('; ')}`,
    );
    this.name = 'ChainDown';
    this.chain = chain;
    this.failures = failures;
  }
}

/** The node ran the call and it reverted. */
export class Reverted extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Reverted';
  }
}

/** Endpoints that look healthy first, in the listed order; then the rest. */
export function inHealthOrder<T extends { url: string }>(
  endpoints: readonly T[],
  health: Map<string, number>,
  now = Date.now(),
): T[] {
  const down = (e: T) => (health.get(e.url) ?? 0) > now;
  return [...endpoints.filter((e) => !down(e)), ...endpoints.filter(down)];
}

export async function askChain<T>(
  chain: EvmChain,
  method: string,
  params: unknown,
  opts: AskOptions = {},
): Promise<{ result: T; url: string }> {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const health = opts.health ?? (opts.fetch ? new Map<string, number>() : endpointHealth);
  const body = JSON.stringify({ jsonrpc: '2.0', id: 'petal', method, params });
  const failures: EndpointFailure[] = [];
  for (const e of inHealthOrder(chain.endpoints, health)) {
    const failed = (why: string, mark: boolean) => {
      failures.push({ url: e.url, why });
      if (mark) health.set(e.url, Date.now() + HANG_PAUSE_MS);
    };
    let res: Response;
    try {
      res = await doFetch(e.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
        body,
        signal: runSignal(AbortSignal.timeout(opts.timeoutMs ?? ASK_TIMEOUT_MS)),
      });
    } catch (err) {
      failed((err as Error).message, true);
      continue;
    }
    if (!res.ok) {
      failed(`HTTP ${res.status}`, res.status === 429 || res.status >= 500);
      continue;
    }
    let json: { result?: unknown; error?: { message?: string; data?: unknown } };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      failed('the answer is not JSON', true);
      continue;
    }
    const message = json.error?.message;
    if (message !== undefined || json.error) {
      if (/revert/i.test(`${message} ${String(json.error?.data)}`))
        throw new Reverted(message ?? 'execution reverted');
      failed(message ?? 'an error with no message', false);
      continue;
    }
    if (json.result === undefined || json.result === null) {
      failed('no result', false);
      continue;
    }
    if (opts.accept && !opts.accept(json.result)) {
      failed('an answer with nothing in it', false);
      continue;
    }
    return { result: json.result as T, url: e.url };
  }
  throw new ChainDown(chain.name, failures);
}
