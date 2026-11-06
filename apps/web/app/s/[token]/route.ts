// A link to an exploration (SYS-042): /s/<token> serves its resume packet as markdown, for an agent
// that can only fetch a URL. The route lives in httpApp, as /mcp's does; no page, and no session.
import { handle } from '@hono/vercel';
import { getApp } from '../../../lib/server-app.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const { app } = await getApp();
  return handle(app)(req);
}
