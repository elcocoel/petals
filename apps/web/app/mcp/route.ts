// MCP over HTTP at this site's /mcp: one URL for a client's connector settings. The route itself
// lives in httpApp; the /api catch-all doesn't reach it.
import { handle } from '@hono/vercel';
import { originFrom } from '../../lib/agent-prompt.ts';
import { getApp } from '../../lib/server-app.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function serve(req: Request): Promise<Response> {
  const { app } = await getApp();
  // SITE_HEADER in @petal/tools: this is a site with pages, and this is its address.
  const headers = new Headers(req.headers);
  headers.set('x-petal-site', originFrom(req.headers));
  return handle(app)(new Request(req, { headers }));
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
export const OPTIONS = serve;
