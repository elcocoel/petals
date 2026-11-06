// Server only. Server components call the API in process (no HTTP hop), through the same app
// that /api/[[...route]] serves, so pages and API always agree.
import type { ToolError } from '@petal/core/types';
import { getApp } from './server-app.ts';
import { visitorAddress } from './visitor.ts';

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: ToolError['error'] };

export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown; cookie?: string | null },
): Promise<ApiResult<T>> {
  const { app } = await getApp();
  const res = await app.request(path, {
    method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(await visitorAddress()),
      // in process, so the caller's own session comes along only when a page passes it on
      ...(init?.cookie ? { cookie: init.cookie } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (res.ok && json !== undefined) return { ok: true, value: json as T };
  const error = (json as ToolError | undefined)?.error ?? {
    code: 'internal' as const,
    message: `${path}: HTTP ${res.status}`,
  };
  return { ok: false, status: res.status, error };
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body });
