// The one way Petal's tools read a URL someone else chose (T333). They run on a person's machine, next
// to whatever else listens there, so this is in the fetcher and not in a prompt: it reaches public
// addresses and nothing else, however the address is spelled.
//
// Every hop: http or https only, ports 80 and 443, no user:pass in the URL, no name that only means
// something on a local network. Then resolve the name, check EVERY address it resolves to, and connect
// to the address that was checked, with no second lookup, so a name that changes its answer (DNS
// rebinding) changes nothing. A redirect is a new hop, checked the same way. IP literals are checked
// as literals; the URL parser has already turned decimal, octal and hex spellings into dotted form.
//
// No cookies, no credentials and no keep-alive. Size and time caps cover the whole read, redirects
// included, and compressed bodies are counted after decompression.
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { runSignal } from '@petal/core';

export const PAGE_TIMEOUT_MS = 10_000;
export const PAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PAGE_MAX_REDIRECTS = 5;
const USER_AGENT = 'petal/0.1 (keyless public reads)';

/** The URL or an address it reached isn't public. Never retried, and never a network error. */
export class NotPublic extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotPublic';
  }
}

const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], // this network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, and the cloud metadata address
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and broadcast
] as const)
  blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // old site-local
  ['ff00::', 8], // multicast
] as const)
  blocked.addSubnet(net, bits, 'ipv6');

/** Expand an IPv6 address to its 8 groups, as numbers. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0] as string;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (dotted) {
    const parts = dotted.split('.').map(Number) as [number, number, number, number];
    const hi = ((parts[0] << 8) | parts[1]).toString(16);
    const lo = ((parts[2] << 8) | parts[3]).toString(16);
    text = `${text.slice(0, -dotted.length)}${hi}:${lo}`;
  }
  const [head = '', tail] = text.split('::');
  const start = head ? head.split(':') : [];
  const end = tail ? tail.split(':') : [];
  const missing = 8 - start.length - end.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  return [...start, ...Array<string>(missing).fill('0'), ...end].map((g) => Number.parseInt(g, 16));
}

const dottedFrom = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** An IPv4 address carried inside an IPv6 one: mapped, compatible, NAT64 or 6to4. */
function embeddedIpv4(groups: number[]): string | null {
  const g = groups as [number, number, number, number, number, number, number, number];
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(5) && g[5] === 0xffff) return dottedFrom(g[6], g[7]); // ::ffff:a.b.c.d, mapped
  if (zeros(5) && g[5] === 0) return dottedFrom(g[6], g[7]); // ::a.b.c.d, compatible
  if (g[0] === 0 && g[1] === 0 && zeros(4) && g[4] === 0xffff && g[5] === 0)
    return dottedFrom(g[6], g[7]); // ::ffff:0:a.b.c.d, translated
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0)
    return dottedFrom(g[6], g[7]); // 64:ff9b::a.b.c.d, NAT64
  if (g[0] === 0x2002) return dottedFrom(g[1], g[2]); // 2002:a.b.c.d::, 6to4
  return null;
}

/** Is this a public address? Anything unparseable is not. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family !== 6) return false;
  const groups = ipv6Groups(address);
  if (!groups || groups.some((g) => Number.isNaN(g))) return false;
  if (blocked.check(address.split('%')[0] as string, 'ipv6')) return false;
  const inner = embeddedIpv4(groups);
  return inner ? isPublicAddress(inner) : true;
}

const LOCAL_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/i;

/** Parses and checks what can be checked before any lookup. Throws NotPublic. */
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NotPublic(`"${raw}" is not a URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new NotPublic(`only http and https, not ${url.protocol}`);
  if (url.username || url.password) throw new NotPublic('a URL with a user or password');
  if (url.port && url.port !== '80' && url.port !== '443')
    throw new NotPublic(`only the web's own ports, not ${url.port}`);
  const host = hostOf(url);
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new NotPublic(`${host} is not a public address`);
  } else if (!host.includes('.') || LOCAL_NAMES.test(host)) {
    throw new NotPublic(`${host} is not a public name`);
  }
  return url;
}

const hostOf = (url: URL) => url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');

export interface Resolved {
  address: string;
  family: number;
}
export type Resolve = (host: string) => Promise<Resolved[]>;

const systemResolve: Resolve = (host) => dnsLookup(host, { all: true });

/** Every address the name resolves to must be public: one private one in the list refuses it. */
export async function resolvePublic(url: URL, resolve: Resolve = systemResolve): Promise<Resolved> {
  const host = hostOf(url);
  const family = isIP(host);
  if (family) return { address: host, family };
  let found: Resolved[];
  try {
    found = await resolve(host);
  } catch (e) {
    throw new Error(`${host} did not resolve: ${(e as Error).message}`);
  }
  if (found.length === 0) throw new Error(`${host} did not resolve`);
  for (const a of found)
    if (!isPublicAddress(a.address))
      throw new NotPublic(`${host} resolves to ${a.address}, which is not public`);
  return found[0] as Resolved;
}

export interface Hop {
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer;
  truncated: boolean;
}

/** One request to one checked address. A seam for tests: no name is looked up in here. */
export type Transport = (
  url: URL,
  to: Resolved,
  limits: { maxBytes: number; signal: AbortSignal },
) => Promise<Hop>;

function decoded(res: IncomingMessage): NodeJS.ReadableStream {
  const encoding = (res.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return res.pipe(createGunzip());
  if (encoding === 'deflate') return res.pipe(createInflate());
  if (encoding === 'br') return res.pipe(createBrotliDecompress());
  return res;
}

/** The real one: connects to `to.address` whatever the name now resolves to. */
export const pinnedTransport: Transport = (url, to, { maxBytes, signal }) =>
  new Promise((done, fail) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      url,
      {
        method: 'GET',
        agent: false,
        signal,
        // Called instead of DNS. With autoSelectFamily, Node asks for a list.
        lookup: (_host, options, callback) => {
          const cb = callback as (e: Error | null, a: unknown, f?: number) => void;
          if ((options as { all?: boolean }).all) cb(null, [to]);
          else cb(null, to.address, to.family);
        },
        headers: {
          accept: 'text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1',
          'accept-encoding': 'gzip, deflate, br',
          'user-agent': USER_AGENT,
          connection: 'close',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location ?? null;
        const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
        if (status >= 300 && status < 400 && location) {
          res.destroy();
          done({ status, location, contentType, body: Buffer.alloc(0), truncated: false });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        const finish = (truncated: boolean) => {
          if (settled) return;
          settled = true;
          done({
            status,
            location,
            contentType,
            body: Buffer.concat(chunks).subarray(0, maxBytes),
            truncated,
          });
        };
        const stream = decoded(res);
        stream.on('data', (d: Buffer) => {
          chunks.push(d);
          size += d.length;
          if (size > maxBytes) {
            finish(true);
            res.destroy();
          }
        });
        stream.on('end', () => finish(false));
        stream.on('error', (e: Error) => {
          if (!settled) fail(e);
        });
        res.on('error', (e: Error) => {
          if (!settled) fail(e);
        });
      },
    );
    req.on('error', fail);
    req.end();
  });

export interface PublicPage extends Hop {
  final_url: string;
  redirects: number;
}

export interface FetchPublicOptions {
  resolve?: Resolve;
  transport?: Transport;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/** Reads a public URL, following redirects. Throws NotPublic when it isn't, at any hop. */
export async function fetchPublic(raw: string, opts: FetchPublicOptions = {}): Promise<PublicPage> {
  const transport = opts.transport ?? pinnedTransport;
  const maxBytes = opts.maxBytes ?? PAGE_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? PAGE_MAX_REDIRECTS;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? PAGE_TIMEOUT_MS);
  const signal = runSignal(timeout) ?? timeout;
  let current = raw;
  for (let redirects = 0; ; redirects++) {
    const url = checkUrl(current);
    const to = await resolvePublic(url, opts.resolve ?? systemResolve);
    const hop = await transport(url, to, { maxBytes, signal });
    if (hop.status < 300 || hop.status >= 400 || !hop.location)
      return { ...hop, final_url: url.toString(), redirects };
    if (redirects >= maxRedirects) throw new Error(`more than ${maxRedirects} redirects`);
    current = new URL(hop.location, url).toString();
  }
}
