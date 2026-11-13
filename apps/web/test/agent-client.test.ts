// T178: the adapter says the same things to the server the components used to, and turns the answers
// into plain values. Each error here is word for word what the page showed before.

import { DEFAULT_VIEW } from '@petal/core/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  agentClient,
  askQuote,
  drawFlower,
  keepView,
  preparePublish,
  publishEntry,
  refusalCode,
  SignInFirst,
  saveView,
} from '../lib/agent-client.ts';

interface Call {
  url: string;
  init?: RequestInit;
}

function serve(respond: () => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    return respond();
  });
  return calls;
}
const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sse = (text: string) => () =>
  new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
const events = async (from: AsyncIterable<{ event: string }>) => {
  const out: string[] = [];
  for await (const e of from) out.push(e.event);
  return out;
};

afterEach(() => vi.unstubAllGlobals());

const STREAM = [
  'event: run\ndata: {"run_id":"r1","resume_url":"/make?run=r1"}\nid: 0\n\n',
  'event: heartbeat\ndata: {}\n\n',
  'event: message\ndata: {"text":"hi"}\nid: 1\n\n',
  'event: done\ndata: {"turns":1}\nid: 2\n\n',
].join('');

describe('chat', () => {
  test('posts what it is given, asks for a stream, and yields the events without heartbeats', async () => {
    const calls = serve(sse(STREAM));
    const body = { messages: [{ role: 'user' as const, content: 'q' }], run_id: 'r1' };
    expect(await events(agentClient.chat(body))).toEqual(['run', 'message', 'done']);
    expect(calls[0]?.url).toBe('/api/v1/agent/chat');
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });
  });

  test('a refusal throws code and message', async () => {
    serve(json({ error: { code: 'rate_limited', message: 'slow down' } }, 429));
    const refused = await events(agentClient.chat({ messages: [] })).catch((e: unknown) => e);
    // the code travels apart from the words, so the chat can answer a refusal for what it is
    expect(refusalCode(refused)).toBe('rate_limited');
    expect((refused as Error).message).toBe('slow down');
  });

  test('a refusal with no JSON throws the status', async () => {
    serve(() => new Response('nope', { status: 502 }));
    await expect(events(agentClient.chat({ messages: [] }))).rejects.toThrow('HTTP 502');
  });

  test('a network failure throws as it came', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(events(agentClient.chat({ messages: [] }))).rejects.toThrow('Failed to fetch');
  });

  test('a stream that breaks throws after what it delivered', async () => {
    const encoder = new TextEncoder();
    serve(
      () =>
        new Response(
          new ReadableStream({
            pull(c) {
              c.enqueue(encoder.encode('event: run\ndata: {}\n\n'));
              c.error(new TypeError('network error'));
            },
          }),
        ),
    );
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const e of agentClient.chat({ messages: [] })) seen.push(e.event);
      })(),
    ).rejects.toThrow('network error');
  });

  test('a stream that closes quietly just ends: what that means is not the adapter’s call', async () => {
    serve(sse('event: run\ndata: {}\n\n'));
    expect(await events(agentClient.chat({ messages: [] }))).toEqual(['run']);
  });
});

describe('readRun', () => {
  test('a stored run', async () => {
    const calls = serve(json({ run_id: 'r/1', status: 'done', events: [], messages: [] }));
    expect(await agentClient.readRun('r/1')).toMatchObject({
      ok: true,
      run: { run_id: 'r/1', status: 'done' },
    });
    expect(calls[0]?.url).toBe('/api/v1/agent/runs/r%2F1');
  });

  test('no such run, with the server’s words, or the status when it has none', async () => {
    serve(json({ error: { code: 'not_found', message: 'no run r1' } }, 404));
    expect(await agentClient.readRun('r1')).toEqual({
      ok: false,
      code: 'not_found',
      message: 'no run r1',
    });
    serve(json({}, 500));
    expect(await agentClient.readRun('r1')).toEqual({
      ok: false,
      code: 'not_found',
      message: 'HTTP 500',
    });
  });
});

describe('followRun', () => {
  test('asks for the stream and skips what the stored run already showed', async () => {
    const calls = serve(sse(STREAM));
    expect(await events(agentClient.followRun('r1', 2))).toEqual(['done']);
    expect(calls[0]?.url).toBe('/api/v1/agent/runs/r1');
    expect(calls[0]?.init).toEqual({ headers: { accept: 'text/event-stream' } });
  });

  test('a heartbeat is not counted as a replayed event', async () => {
    serve(sse(STREAM));
    expect(await events(agentClient.followRun('r1', 1))).toEqual(['message', 'done']);
  });

  test('no body, no events', async () => {
    serve(() => new Response(null, { status: 200 }));
    expect(await events(agentClient.followRun('r1', 0))).toEqual([]);
  });
});

describe('saveView', () => {
  test('keeps the view on the server and gives back what it kept, with its hash', async () => {
    const kept = { view: DEFAULT_VIEW, hash: 'ab'.repeat(32) };
    const calls = serve(json(kept));
    expect(await saveView(DEFAULT_VIEW)).toEqual(kept);
    expect(calls[0]?.url).toBe('/api/v1/me/view');
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ view: DEFAULT_VIEW }));
  });

  test('throws the server’s reason when it’s refused', async () => {
    serve(json({ error: { message: 'sign in first' } }, 401));
    await expect(saveView(DEFAULT_VIEW)).rejects.toThrow('sign in first');
    serve(json({}, 500));
    await expect(saveView(DEFAULT_VIEW)).rejects.toThrow('HTTP 500');
  });
});

describe('keepView', () => {
  test('keeps a visitor’s view by its hash, nobody’s', async () => {
    const kept = { view: DEFAULT_VIEW, hash: 'cd'.repeat(32) };
    const calls = serve(json(kept));
    expect(await keepView(DEFAULT_VIEW)).toEqual(kept);
    expect(calls[0]?.url).toBe('/api/v1/views');
    expect(calls[0]?.init?.method).toBe('PUT');
  });

  test('a visitor’s own view refused on /me is told apart, with the server’s words', async () => {
    serve(json({ error: { message: 'Sign in to keep your own view' } }, 401));
    const refused = saveView(DEFAULT_VIEW);
    await expect(refused).rejects.toBeInstanceOf(SignInFirst);
    await expect(refused).rejects.toThrow('Sign in to keep your own view');
  });
});

describe('drawFlower', () => {
  test('carries the reading when it comes back', async () => {
    const reading = { title: 'A flower', petals: [] };
    serve(json({ svg: '<svg/>', petals: [], legend: [], reading }));
    expect(await drawFlower('{"a":1}', DEFAULT_VIEW)).toEqual({
      svg: '<svg/>',
      petals: [],
      legend: [],
      reading,
    });
  });

  test('posts the spec as it was given and returns the drawing', async () => {
    const calls = serve(json({ svg: '<svg/>' }));
    expect(await drawFlower('{"a":1}', DEFAULT_VIEW)).toEqual({
      svg: '<svg/>',
      petals: [],
      legend: [],
    });
    expect(calls[0]?.url).toBe('/api/v1/render');
    expect(calls[0]?.init?.body).toBe(
      `{"spec":{"a":1},"include_svg":true,"include_reading":true,"view":${JSON.stringify(DEFAULT_VIEW)}}`,
    );
  });

  test('throws the server’s message, or the status', async () => {
    serve(json({ error: { message: 'bad spec' } }, 422));
    await expect(drawFlower('{}', DEFAULT_VIEW)).rejects.toThrow('bad spec');
    serve(json({}, 500));
    await expect(drawFlower('{}', DEFAULT_VIEW)).rejects.toThrow('HTTP 500');
  });
});

describe('askQuote (QuotePanel’s call, unchanged)', () => {
  const request = { purpose: 'sponsor_refresh' as const, amount_usd: 1 };

  test('posts the request and returns the quote', async () => {
    const calls = serve(json({ dry: true }));
    expect(await askQuote(request)).toEqual({ dry: true });
    expect(calls[0]).toMatchObject({
      url: '/api/v1/quote',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      },
    });
  });

  test('throws the server’s message, or the status; a body that is not JSON throws too', async () => {
    serve(json({ error: { message: 'no route' } }, 400));
    await expect(askQuote(request)).rejects.toThrow('no route');
    serve(json({}, 503));
    await expect(askQuote(request)).rejects.toThrow('HTTP 503');
    serve(() => new Response('nope', { status: 500 }));
    await expect(askQuote(request)).rejects.toThrow(SyntaxError);
  });
});

describe('publish (PublishFlow’s calls, unchanged)', () => {
  const proof = { account_id: 'a' } as never;

  test('prepare and publish post what they did', async () => {
    const calls = serve(json({ entry_sha256: 'e' }));
    await preparePublish({ title: 't' } as never);
    await publishEntry('e', proof);
    expect(calls.map((c) => [c.url, c.init?.body])).toEqual([
      ['/api/v1/publish/prepare', '{"entry":{"title":"t"}}'],
      ['/api/v1/publish', '{"entry_sha256":"e","proof":{"account_id":"a"}}'],
    ]);
  });

  test('a failure reads code, message and hint; with no body, the status', async () => {
    serve(json({ error: { code: 'unauthorised', message: 'bad', hint: 'sign again' } }, 401));
    await expect(publishEntry('e', proof)).rejects.toThrow('unauthorised: bad (sign again)');
    serve(json({ error: { code: 'unauthorised', message: 'bad' } }, 401));
    await expect(publishEntry('e', proof)).rejects.toThrow(/^unauthorised: bad$/);
    serve(() => new Response('nope', { status: 500 }));
    await expect(publishEntry('e', proof)).rejects.toThrow('HTTP 500');
  });
});
