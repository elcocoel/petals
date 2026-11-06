// How the HTTP door answers: a tool's output as JSON, with its error code as the status.
import type { ToolError } from '@petal/core/types';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { versioned } from '../define.ts';
import { HTTP_STATUS, isToolError, toolError } from '../errors.ts';

export function respond(c: Context, out: unknown): Response {
  if (isToolError(out)) {
    const status = HTTP_STATUS[out.error.code];
    if (out.error.retry_after_s !== undefined)
      c.header('Retry-After', String(out.error.retry_after_s));
    return c.json(out, status);
  }
  return c.json(out as Record<string, unknown>, 200);
}

export const fail = (c: Context, e: ToolError) => respond(c, versioned(e));

/** The largest body anything takes but a chat. A flower's entry fits: the map's own limit is this. */
export const BODY_MAX_BYTES = 256 * 1024;

/** Refuses what's too large before it's read, whether it declares a length or streams. */
export const bodyCap: MiddlewareHandler = bodyLimit({
  maxSize: BODY_MAX_BYTES,
  onError: (c) => fail(c, toolError('bad_input', 'The body is larger than 256 KiB.')),
});

/** The JSON body, {} when empty; a ToolError when it is not JSON. */
export async function body(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return versioned(
      toolError('bad_input', 'The request body is not JSON.', 'Send application/json.'),
    );
  }
}
