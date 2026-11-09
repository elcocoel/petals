// Server only. Who a page is rendering for, and on which address, for the server it calls (lib/api.ts).
// Without the visitor's address, every visitor to a public site shares one limit, and past it pages
// lose what they load. app/layout.tsx supplies the source, because lib/ doesn't import next. It lives on
// globalThis because route handlers and server components may each load this module separately.
import { SITE_HEADER, VISITOR_HEADER, visitorOf } from './server.ts';

export type VisitorHeaders = () => Promise<{ get(name: string): string | null }>;

const g = globalThis as { __petalVisitorHeaders?: VisitorHeaders };

export function readVisitorFrom(source: VisitorHeaders): void {
  g.__petalVisitorHeaders = source;
}

/** Outside a request there's nobody to name, and the call goes on with no address. */
export async function visitorAddress(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const incoming = await g.__petalVisitorHeaders?.();
    if (!incoming) return out;
    const visitor = visitorOf(incoming);
    if (visitor) out[VISITOR_HEADER] = visitor;
    const host = incoming.get('x-forwarded-host') ?? incoming.get('host');
    if (host) {
      const proto =
        incoming.get('x-forwarded-proto') ??
        (/^(localhost|127\.0\.0\.1)\b/.test(host) ? 'http' : 'https');
      out[SITE_HEADER] = `${proto}://${host}`;
    }
  } catch {
    // not in a request: a test, or a script
  }
  return out;
}
