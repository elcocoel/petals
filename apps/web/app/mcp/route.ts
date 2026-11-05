// MCP over HTTP at this site's /mcp: one URL for a client's connector settings. The route itself
// lives in httpApp; the /api catch-all doesn't reach it.
import { handle } from '@hono/vercel';
import { getApp } from '../../lib/server-app.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function serve(req: Request): Promise<Response> {
  const { app } = await getApp();
  return handle(app)(req);
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
export const OPTIONS = serve;
