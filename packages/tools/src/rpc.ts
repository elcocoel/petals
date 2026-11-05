// A minimal NEAR JSON-RPC `query` client: what verifyNep413 needs (view_access_key). Errors look
// like near-api-js's (a `type` such as AccessKeyDoesNotExist), so either can stand behind `Rpc`.
import { runSignal } from '@petal/core';
import type { Rpc, RpcQuery } from '@petal/near/auth';

export const RPC_URLS = {
  testnet: 'https://rpc.testnet.fastnear.com',
  mainnet: 'https://rpc.mainnet.fastnear.com',
} as const;

interface RpcErrorBody {
  name?: string;
  message?: string;
  data?: unknown;
  cause?: { name?: string; info?: unknown };
}

function rpcError(message: string, type: string, cause?: unknown): Error {
  return Object.assign(new Error(message), { type, cause });
}

export function jsonRpc(
  url: string,
  opts: { apiKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Rpc {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return {
    async query<T = unknown>(params: RpcQuery): Promise<T> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
      const res = await doFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 'petal', method: 'query', params }),
        signal: runSignal(AbortSignal.timeout(timeoutMs)),
      });
      if (!res.ok) throw rpcError(`NEAR RPC answered ${res.status}`, 'RpcHttpError');
      const body = (await res.json()) as { result?: unknown; error?: RpcErrorBody };
      if (body.error) {
        const cause = body.error.cause?.name;
        const type =
          cause === 'UNKNOWN_ACCESS_KEY' ? 'AccessKeyDoesNotExist' : (cause ?? 'RpcError');
        const detail = typeof body.error.data === 'string' ? body.error.data : body.error.message;
        throw rpcError(detail ?? 'NEAR RPC error', type, body.error);
      }
      // Older nodes answer a missing key inside `result`.
      const result = body.result as { error?: unknown } | undefined;
      if (result && typeof result.error === 'string') {
        const type = /does not exist/.test(result.error) ? 'AccessKeyDoesNotExist' : 'RpcError';
        throw rpcError(result.error, type, result);
      }
      return body.result as T;
    },
  };
}
