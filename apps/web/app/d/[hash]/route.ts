// A short draft link (SYS-043): /d/<spec hash> redirects to /draft?spec=. The route lives in httpApp,
// as /mcp's does; the /api catch-all doesn't reach it.
import { handle } from '@hono/vercel';
import { getApp } from '../../../lib/server-app.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const { app } = await getApp();
  return handle(app)(req);
}
