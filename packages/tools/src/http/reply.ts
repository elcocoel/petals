// How the HTTP door answers: a tool's output as JSON, with its error code as the status.
import type { ToolError } from '@petal/core/types';
import type { Context } from 'hono';
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
