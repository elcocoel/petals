// The chat's SSE reader: blocks, multi-line data, CRLF, and messages split across chunks.
import { describe, expect, test } from 'vitest';
import { parseBlock, readSse } from '../lib/sse.ts';

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
      c.close();
    },
  });

async function all(body: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const m of readSse(body)) out.push(m);
  return out;
}

describe('parseBlock', () => {
  test('reads event, data and id; skips comments', () => {
    expect(parseBlock(': hi\nevent: run\nid: 3\ndata: {"a":1}')).toEqual({
      event: 'run',
      id: '3',
      data: '{"a":1}',
    });
  });
  test('joins data lines and defaults the event name', () => {
    expect(parseBlock('data: a\ndata: b')).toEqual({ event: 'message', data: 'a\nb' });
  });
  test('a block without data is no message', () => {
    expect(parseBlock('event: x')).toBeNull();
  });
});

describe('readSse', () => {
  test('yields messages in order across chunk boundaries', async () => {
    const msgs = await all(
      streamOf('event: run\nda', 'ta: {"run_id":"r1"}\n\nevent: st', 'age\ndata: {}\n\n'),
    );
    expect(msgs.map((m) => m.event)).toEqual(['run', 'stage']);
    expect(JSON.parse(msgs[0]?.data ?? '')).toEqual({ run_id: 'r1' });
  });
  test('handles CRLF and a last block without a blank line', async () => {
    const msgs = await all(streamOf('event: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2'));
    expect(msgs).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });
});
