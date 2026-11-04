// A small text/event-stream reader for fetch() bodies. EventSource can't POST, and the agent
// chat is a POST (http-api.md, Agent chat), so the client reads the stream itself.

export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

/** Parse one SSE block (the lines between blank lines). Comments and unknown fields are skipped. */
export function parseBlock(block: string): SseMessage | null {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const at = line.indexOf(':');
    const field = at === -1 ? line : line.slice(0, at);
    let value = at === -1 ? '' : line.slice(at + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  }
  if (!data.length) return null;
  return id === undefined ? { event, data: data.join('\n') } : { event, data: data.join('\n'), id };
}

/** Yield every SSE message in a byte stream, in order. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = done ? '' : (blocks.pop() ?? '');
      for (const b of blocks) {
        const m = parseBlock(b);
        if (m) yield m;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
