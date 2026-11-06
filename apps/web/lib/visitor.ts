// Server only. Who a page is rendering for, as the API's limiter reads it (@petal/tools, clientAddress).
// A call in process has no address of its own, so without this every visitor to a public site shares one
// limit, and past it pages lose what they load. app/layout.tsx supplies the source, because lib/ doesn't
// import next. It lives on globalThis because route handlers and server components may each load this
// module separately, as lib/server-app.ts says.
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
    for (const name of ['cf-connecting-ip', 'x-real-ip']) {
      const value = incoming?.get(name);
      if (value) out[name] = value;
    }
  } catch {
    // not in a request: a test, or a script
  }
  return out;
}
