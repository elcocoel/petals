// T333: what read_page may reach. The fetcher is what holds this, not a prompt: Petal's tools run on a
// person's machine, next to everything else listening there.
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  checkUrl,
  fetchPublic,
  isPublicAddress,
  NotPublic,
  pinnedTransport,
  type Resolve,
  type Transport,
} from '../../src/public-fetch.ts';

const PUBLIC = { address: '93.184.216.34', family: 4 };
const resolvesTo =
  (...answers: string[][]): Resolve =>
  async () => {
    const list = answers.length > 1 ? (answers.shift() as string[]) : (answers[0] as string[]);
    return list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
const page = (body = 'ok') => ({
  status: 200,
  location: null,
  contentType: 'text/plain',
  body: Buffer.from(body),
  truncated: false,
});
const redirect = (location: string) => ({ ...page(''), status: 302, location });

describe('the address itself', () => {
  test.each([
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // the cloud metadata address
    '100.64.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd00:ec2::254', // metadata over IPv6
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1', // mapped
    '::ffff:7f00:1', // mapped, in hex
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',
    '::ffff:10.0.0.1',
    '::127.0.0.1', // compatible
    '::ffff:0:127.0.0.1', // translated
    '64:ff9b::7f00:1', // NAT64
    '64:ff9b::10.0.0.1',
    '2002:7f00:1::', // 6to4
    '2002:c0a8:101::',
    'not an address',
    '',
  ])('%s is not public', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  test.each([
    '93.184.216.34',
    '8.8.8.8',
    '172.32.0.1',
    '192.169.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
  ])('%s is public', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('the URL, before any lookup', () => {
  test.each([
    'http://127.0.0.1/',
    'http://localhost/',
    'http://LOCALHOST/',
    'http://localhost./',
    'http://foo.localhost/',
    'http://printer.local/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[fd00:ec2::254]/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://2130706433/', // decimal
    'http://0x7f000001/', // hex
    'http://0x7f.0.0.1/',
    'http://017700000001/', // octal
    'http://0177.0.0.1/',
    'http://127.1/', // short form
    'http://0/',
    'http://①②⑦.⓪.⓪.①/', // what normalises to loopback
    'http://intranet/', // one word
    'file:///etc/passwd',
    'ftp://example.org/',
    'gopher://example.org/',
    'data:text/html,hi',
    'javascript:alert(1)',
    'http://user:pass@example.org/',
    'http://example.org@127.0.0.1/',
    'http://example.org:3080/', // this machine's own services listen on ports like these
    'https://example.org:22/',
    'not a url',
    '',
  ])('%s is refused', (url) => {
    expect(() => checkUrl(url)).toThrow(NotPublic);
  });

  test.each([
    'http://example.org/',
    'https://example.org/a?b=c',
    'https://example.org:443/',
    'http://93.184.216.34/',
  ])('%s is allowed', (url) => {
    expect(() => checkUrl(url)).not.toThrow();
  });
});

describe('after DNS, on every hop, and connecting to what was checked', () => {
  const never: Transport = async () => {
    throw new Error('must not connect');
  };

  test('a name that resolves to a private address never gets a connection', async () => {
    for (const bad of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '::1', '::ffff:127.0.0.1']) {
      await expect(
        fetchPublic('https://evil.example/', { resolve: resolvesTo([bad]), transport: never }),
      ).rejects.toBeInstanceOf(NotPublic);
    }
  });

  test('one private address among public ones refuses the name', async () => {
    await expect(
      fetchPublic('https://evil.example/', {
        resolve: resolvesTo(['93.184.216.34', '127.0.0.1']),
        transport: never,
      }),
    ).rejects.toBeInstanceOf(NotPublic);
  });

  test('a redirect to a private address, by literal, by name or by scheme, is refused', async () => {
    for (const [location, resolve] of [
      ['http://127.0.0.1/secret', resolvesTo(['93.184.216.34'])],
      ['http://169.254.169.254/latest/meta-data/', resolvesTo(['93.184.216.34'])],
      ['http://2130706433/', resolvesTo(['93.184.216.34'])],
      ['file:///etc/passwd', resolvesTo(['93.184.216.34'])],
      ['http://example.org:3080/', resolvesTo(['93.184.216.34'])],
      ['https://rebinds.example/', resolvesTo(['93.184.216.34'], ['10.0.0.5'])],
    ] as const) {
      const seen: string[] = [];
      const transport: Transport = async (url) => {
        seen.push(url.host);
        return redirect(location);
      };
      await expect(
        fetchPublic('https://start.example/', { resolve, transport }),
      ).rejects.toBeInstanceOf(NotPublic);
      expect(seen).toEqual(['start.example']);
    }
  });

  test('DNS rebinding: it connects to the address it checked, and asks DNS once a hop', async () => {
    let asked = 0;
    const rebinding: Resolve = async () => {
      asked++;
      return asked === 1 ? [PUBLIC] : [{ address: '127.0.0.1', family: 4 }];
    };
    const connectedTo: string[] = [];
    const transport: Transport = async (_url, to) => {
      connectedTo.push(to.address);
      return page();
    };
    await fetchPublic('https://rebinds.example/', { resolve: rebinding, transport });
    expect(connectedTo).toEqual([PUBLIC.address]);
    expect(asked).toBe(1);
  });

  test('DNS rebinding across a redirect to the same name is caught on the new hop', async () => {
    let asked = 0;
    const rebinding: Resolve = async () => {
      asked++;
      return asked === 1 ? [PUBLIC] : [{ address: '127.0.0.1', family: 4 }];
    };
    const transport: Transport = async () => redirect('/next');
    await expect(
      fetchPublic('https://rebinds.example/', { resolve: rebinding, transport }),
    ).rejects.toBeInstanceOf(NotPublic);
    expect(asked).toBe(2);
  });

  test('a relative redirect is followed, and too many are refused', async () => {
    const resolve = resolvesTo(['93.184.216.34']);
    let n = 0;
    const once: Transport = async () => (n++ === 0 ? redirect('/there') : page('there'));
    const out = await fetchPublic('https://ok.example/here', { resolve, transport: once });
    expect(out).toMatchObject({ final_url: 'https://ok.example/there', redirects: 1 });
    await expect(
      fetchPublic('https://ok.example/', { resolve, transport: async () => redirect('/again') }),
    ).rejects.toThrow(/more than 5 redirects/);
  });
});

describe('the real transport, against a real socket', () => {
  let server: Server;
  let port = 0;
  let hits: { path: string; headers: IncomingHttpHeaders }[] = [];
  let handler: Parameters<typeof createServer>[1] = (_req, res) => res.end('hello');

  beforeEach(async () => {
    hits = [];
    handler = (_req, res) => res.end('hello');
    server = createServer((req, res) => {
      hits.push({ path: req.url ?? '', headers: req.headers });
      handler?.(req, res);
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    port = (server.address() as AddressInfo).port;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });

  /** A public-looking address, sent to this test's own server. */
  const toLocal: Transport = (url, _to, limits) =>
    pinnedTransport(
      new URL(url.pathname + url.search, `http://127.0.0.1:${port}`),
      { address: '127.0.0.1', family: 4 },
      limits,
    );
  const opts = { resolve: resolvesTo(['93.184.216.34']), transport: toLocal };

  test('a real request to this machine is refused, and the server never hears of it', async () => {
    for (const url of [
      `http://127.0.0.1:${port}/`,
      `http://localhost:${port}/`,
      'http://127.0.0.1/',
      'http://localhost/',
      'http://[::1]/',
      'http://2130706433/',
    ]) {
      await expect(fetchPublic(url)).rejects.toBeInstanceOf(NotPublic);
    }
    expect(hits).toEqual([]);
  });

  test('it connects to the pinned address, without asking DNS for the name', async () => {
    const hop = await pinnedTransport(
      new URL(`http://this-name-does-not-resolve.invalid:${port}/pinned`),
      { address: '127.0.0.1', family: 4 },
      { maxBytes: 1000, signal: AbortSignal.timeout(2000) },
    );
    expect(hop.body.toString()).toBe('hello');
    expect(hits[0]?.path).toBe('/pinned');
    expect(hits[0]?.headers.host).toContain('this-name-does-not-resolve.invalid');
  });

  test('a real redirect to this machine is refused, and its target is never read', async () => {
    handler = (req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { location: `http://127.0.0.1:${port}/secret` });
        res.end();
      } else res.end('the secret');
    };
    await expect(fetchPublic('https://ok.example/start', opts)).rejects.toBeInstanceOf(NotPublic);
    expect(hits.map((h) => h.path)).toEqual(['/start']);
  });

  test('sends no cookies and no credentials, even when a redirect sets one', async () => {
    handler = (req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { location: '/next', 'set-cookie': 'session=abc' });
        res.end();
      } else res.end('done');
    };
    const out = await fetchPublic('https://ok.example/start', opts);
    expect(out.body.toString()).toBe('done');
    for (const h of hits) {
      expect(h.headers.cookie).toBeUndefined();
      expect(h.headers.authorization).toBeUndefined();
    }
  });

  test('stops at the size cap, on a plain body and on a compressed one', async () => {
    handler = (_req, res) => res.end(Buffer.alloc(300_000, 'a'));
    const plain = await fetchPublic('https://ok.example/', { ...opts, maxBytes: 100_000 });
    expect(plain).toMatchObject({ truncated: true });
    expect(plain.body.length).toBe(100_000);
    const bomb = gzipSync(Buffer.alloc(20_000_000));
    handler = (_req, res) => {
      res.writeHead(200, { 'content-encoding': 'gzip' });
      res.end(bomb);
    };
    const zipped = await fetchPublic('https://ok.example/', { ...opts, maxBytes: 100_000 });
    expect(zipped).toMatchObject({ truncated: true });
    expect(zipped.body.length).toBe(100_000);
  });

  test('stops at the time cap, whatever the server does', async () => {
    handler = () => {
      // never answers
    };
    const started = Date.now();
    await expect(fetchPublic('https://ok.example/', { ...opts, timeoutMs: 200 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
