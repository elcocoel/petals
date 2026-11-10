// T053 (tools.md, Contract tests: "each code above has one test"): every error code, through
// HTTP with its status (http-api.md, Rules) and through MCP as the same ToolError.

import type { ToolErrorCode } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { compile, TOOL_ERROR_SCHEMA } from '../../src/define.ts';
import { ERROR_CODES, HTTP_STATUS } from '../../src/errors.ts';
import { httpApp } from '../../src/http/app.ts';
import { callTool } from '../../src/registry.ts';
import type { ToolContext } from '../../src/types.ts';
import { flow, httpMcpClient, rig, validatorsFixture } from '../helpers.ts';
import { ROUTES } from './doors.ts';

type Json = Record<string, unknown>;
const checkError = compile(TOOL_ERROR_SCHEMA);

/** Call `tool` over HTTP and MCP; both must give `code`, HTTP with its status. */
async function expectCode(ctx: ToolContext, code: ToolErrorCode, tool: string, input: Json) {
  const route = ROUTES[tool];
  if (!route) throw new Error(tool);
  const r = route(input);
  const app = httpApp(ctx);
  const res = await app.request(r.path, {
    method: r.method,
    headers: { 'content-type': 'application/json' },
    ...(r.body ? { body: JSON.stringify(r.body) } : {}),
  });
  const body = (await res.json()) as Json;
  expect(res.status, tool).toBe(HTTP_STATUS[code]);
  expect(body, tool).toMatchObject({ error: { code }, tools_version: 'tools/v2' });
  expect(checkError(body), tool).toBe(true);
  const mcp = await httpMcpClient(httpApp(ctx));
  const viaMcp = await mcp.callTool({ name: tool, arguments: input });
  await mcp.close();
  expect(viaMcp.isError, tool).toBe(true);
  expect(viaMcp.structuredContent, tool).toEqual(body);
  return body as {
    error: { code: string; message: string; hint?: string; retry_after_s?: number };
  };
}

describe('one test per error code', () => {
  test('the HTTP status table of http-api.md', () => {
    expect(HTTP_STATUS).toEqual({
      bad_input: 400,
      unauthorised: 401,
      invite_required: 403,
      not_found: 404,
      cannot_read: 422,
      invalid_spec: 422,
      rate_limited: 429,
      budget_exhausted: 429,
      payment_required: 402,
      not_on_this_site: 403,
      source_failed: 502,
      internal: 500,
    });
    expect([...ERROR_CODES].sort()).toEqual(Object.keys(HTTP_STATUS).sort());
  });

  test("not_on_this_site 403: a public site refuses what runs on the person's own machine", async () => {
    // HTTP and in process. Its /mcp doesn't list these at all (public.test.ts).
    const { ctx } = await rig();
    const site = { ...ctx, config: { ...ctx.config, public: true } };
    const res = await httpApp(site).request('/api/v1/find?query=moloch');
    expect(res.status).toBe(HTTP_STATUS.not_on_this_site);
    const body = (await res.json()) as Json;
    expect(body).toMatchObject({ error: { code: 'not_on_this_site' }, tools_version: 'tools/v2' });
    expect(await callTool('find_target', { query: 'moloch' }, site)).toEqual(body);
  });

  test('bad_input 400: an input that does not match the schema', async () => {
    const out = await expectCode((await rig()).ctx, 'bad_input', 'compute_figures', {
      sha256: 'x',
      measure: 'm',
    });
    expect(out.error.message).toMatch(/sha256/);
  });

  test('not_found 404: a snapshot Petal does not hold', async () => {
    await expectCode((await rig()).ctx, 'not_found', 'describe_snapshot', {
      sha256: 'd'.repeat(64),
    });
  });

  test("cannot_read 422: a network Petal can't read, naming what it can", async () => {
    const out = await expectCode((await rig()).ctx, 'cannot_read', 'get_network', {
      id: 'bitcoin-mining-pools',
    });
    expect(out.error.hint).toMatch(/near-validators/);
  });

  test('source_failed 502: the quote source fails', async () => {
    await expectCode((await rig()).ctx, 'source_failed', 'quote_payment', {
      purpose: 'sponsor_coverage',
      amount_usd: 9,
    });
  });

  test('invalid_spec 422: render refuses what validate_spec rejects', async () => {
    const r = await rig();
    const f = await flow(async (name, input) => (await callTool(name, input, r.ctx)) as Json);
    const spec = {
      ...f.spec,
      encodings: { ...(f.spec.encodings as Json), width: { by: 'share' } },
    };
    await expectCode(r.ctx, 'invalid_spec', 'render_flower', { spec, include_svg: false });
  });

  test('unauthorised 401: a proof by a function-call key', async () => {
    const r = await rig();
    const f = await flow(async (name, input) => (await callTool(name, input, r.ctx)) as Json);
    const prep = (await callTool('prepare_publish', { entry: f.draft }, r.ctx)) as Json;
    const proof = r.fcSigner.sign({
      message: prep.message as string,
      nonce: prep.nonce as string,
      recipient: prep.recipient as string,
    });
    await expectCode(r.ctx, 'unauthorised', 'publish_flower', {
      entry_sha256: prep.entry_sha256,
      proof,
    });
  });

  test('rate_limited 429: the 61st tool call in a minute from one address', async () => {
    const app = httpApp((await rig()).ctx);
    const h = { headers: { 'cf-connecting-ip': '9.9.9.9' } };
    for (let i = 0; i < 60; i++) await app.request('/api/v1/networks', h);
    const res = await app.request('/api/v1/networks', h);
    const body = (await res.json()) as Json;
    expect(res.status).toBe(429);
    expect(body).toMatchObject({ error: { code: 'rate_limited', retry_after_s: 60 } });
    expect(checkError(body)).toBe(true);
    // MCP at /mcp counts against the same limit
    const mcp = await app.request('/mcp', { method: 'POST', ...h, body: '{}' });
    expect(mcp.status).toBe(429);
  });

  test('budget_exhausted 429: a capped source says so, and the door keeps the code', async () => {
    // Petal's tools spend no LLM budget; the agent's daily cap (W5) returns this code. A source
    // that reports it keeps it through every door.
    const r = await rig();
    const ctx = {
      ...r.ctx,
      quote: async () => {
        throw Object.assign(new Error('daily cap reached'), {
          code: 'budget_exhausted',
          hint: 'Use the skill with your own agent.',
        });
      },
    };
    await expectCode(ctx, 'budget_exhausted', 'quote_payment', { purpose: 'sponsor_refresh' });
  });

  test('internal 500: an unexpected failure is returned, not thrown', async () => {
    const r = await rig();
    const ctx = {
      ...r.ctx,
      store: {
        ...r.ctx.store,
        get: async () => {
          throw new Error('disk on fire');
        },
      },
    };
    const out = await expectCode(ctx, 'internal', 'describe_snapshot', {
      sha256: validatorsFixture().sha256,
    });
    expect(out.error.message).toBe('disk on fire');
  });
});
