// Server only. Server components call the server over HTTP (002-system research, C6), as any page in the
// browser does, with the site key and the visitor's address, so the server answers them as it answers
// everyone else, and only them.
import type { ToolError } from '@petal/core/types';
import { SITE_KEY_HEADER, serverBase, siteKey } from './server.ts';
import { visitorAddress } from './visitor.ts';

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: ToolError['error'] };

export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown; cookie?: string | null },
): Promise<ApiResult<T>> {
  const key = siteKey();
  let res: Response;
  try {
    res = await fetch(`${serverBase()}${path}`, {
      method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(await visitorAddress()),
        ...(key ? { [SITE_KEY_HEADER]: key } : {}),
        // the caller's own session comes along only when a page passes it on
        ...(init?.cookie ? { cookie: init.cookie } : {}),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch (e) {
    return {
      ok: false,
      status: 503,
      error: {
        code: 'source_failed',
        message: `The server didn't answer: ${(e as Error).message}`,
      },
    };
  }
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

/**
 * For content-addressed reads only, where the answer can never change: the server's reply is kept by the
 * site's cache for good, so it must not depend on who is asking (no visitor address, no cookie). The
 * landing's Power Map draws its saved views this way (lib/power-map.ts). `redirect: 'manual'` keeps a
 * redirect's Location readable.
 */
export async function forever(
  path: string,
  init?: { method?: string; body?: unknown; redirect?: 'manual' },
): Promise<Response | null> {
  const key = siteKey();
  try {
    return await fetch(`${serverBase()}${path}`, {
      method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(key ? { [SITE_KEY_HEADER]: key } : {}),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      ...(init?.redirect ? { redirect: init.redirect } : {}),
      next: { revalidate: 60 * 60 * 24 * 365 },
    });
  } catch {
    return null;
  }
}
