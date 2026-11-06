// The stub model for the paths run by hand (explore-path.ts, journey-server.ts): OpenAI's shape, behind
// the real NEAR AI client. Each question replays the recorded skeleton, so it spends $0 of NEAR AI.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type LlmCompletion, recordedClient, SKELETON_TRANSCRIPT } from '@petal/agent';

const ASKING = 'I can read that for you. Shall I draw it? Yes or no.';
const tokens = (text: string) => Math.ceil(text.length / 4);

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
          const asked = JSON.parse(body) as {
            model: string;
            messages: { role: string }[];
            tools?: unknown[];
            reasoning_effort?: string;
          };
          // As NEAR AI does for Anthropic's models (HTTP 400, seen 2026-11-06).
          if (asked.reasoning_effort && asked.model.startsWith('anthropic/')) {
            return send(400, { error: { message: 'reasoning_effort is not supported' } });
          }
          const from = asked.messages.findLastIndex((m) => m.role === 'user');
          // Offered no tools, it was refused for want of a yes (J4), so it asks. A yes replays again.
          const said: Pick<LlmCompletion, 'message'> = asked.tools?.length
            ? await replay.complete({
                messages: asked.messages.slice(from).map((m) => ({ ...m })) as never,
              })
            : { message: { role: 'assistant', content: ASKING } };
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
            // About four characters a token, so a composer's figures move as a real one's would.
            usage: {
              prompt_tokens: tokens(body),
              completion_tokens: tokens(JSON.stringify(said.message)),
              total_tokens: tokens(body) + tokens(JSON.stringify(said.message)),
            },
          });
        } catch (e) {
          // a server left running shouldn't die on a question the recording can't answer
          send(500, { error: { message: `stub: ${(e as Error).message}` } });
        }
      });
    },
  };
}
