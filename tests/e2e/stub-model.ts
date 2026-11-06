// The stub model for the paths run by hand (explore-path.ts, journey-server.ts): OpenAI's shape, behind
// the real NEAR AI client. Each question replays the recorded skeleton, so it spends $0 of NEAR AI.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { recordedClient, SKELETON_TRANSCRIPT } from '@petal/agent';

export interface StubModel {
  /** chat completions asked for so far */
  readonly calls: number;
  handle(req: IncomingMessage, res: ServerResponse): void;
}

export function stubModel(): StubModel {
  const replay = recordedClient(SKELETON_TRANSCRIPT);
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    handle(req, res) {
      let body = '';
      req.on('data', (d) => {
        body += d;
      });
      req.on('end', async () => {
        const send = (status: number, value: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(value));
        };
        if (!req.url?.endsWith('/chat/completions')) {
          return send(404, { error: { message: 'stub' } });
        }
        calls++;
        try {
          const asked = JSON.parse(body) as { model: string; messages: { role: string }[] };
          const from = asked.messages.findLastIndex((m) => m.role === 'user');
          const said = await replay.complete({
            messages: asked.messages.slice(from).map((m) => ({ ...m })) as never,
          });
          send(200, {
            id: `stub-${calls}`,
            object: 'chat.completion',
            created: 1,
            model: asked.model,
            choices: [
              {
                index: 0,
                finish_reason: said.message.tool_calls?.length ? 'tool_calls' : 'stop',
                message: {
                  role: 'assistant',
                  content: said.message.content,
                  ...(said.message.tool_calls?.length
                    ? {
                        tool_calls: said.message.tool_calls.map((c) => ({
                          id: c.id,
                          type: 'function',
                          function: { name: c.name, arguments: c.arguments },
                        })),
                      }
                    : {}),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
          });
        } catch (e) {
          // a server left running shouldn't die on a question the recording can't answer
          send(500, { error: { message: `stub: ${(e as Error).message}` } });
        }
      });
    },
  };
}
