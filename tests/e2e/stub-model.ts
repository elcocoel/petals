// The stub model for the paths run by hand (explore-path.ts, journey-server.ts): OpenAI's shape, behind
// the real NEAR AI client. Each question replays the recorded skeleton, so it spends $0 of NEAR AI.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type LlmCompletion, recordedClient, SKELETON_TRANSCRIPT } from '@petal/agent';

const ASKING = 'I can read that for you. Shall I draw it? Yes or no.';
const tokens = (text: string) => Math.ceil(text.length / 4);

export interface StubModel {
  /** chat completions asked for so far */
  readonly calls: number;
  /** what each of those named, in order. No effort: the field wasn't sent */
  readonly asked: readonly { model: string; effort: string | null }[];
  /** models that answer 503 for now, so a test can see who's asked next */
  readonly down: Set<string>;
  handle(req: IncomingMessage, res: ServerResponse): void;
}

export function stubModel(): StubModel {
  const replay = recordedClient(SKELETON_TRANSCRIPT);
  let calls = 0;
  const seen: { model: string; effort: string | null }[] = [];
  const down = new Set<string>();
  return {
    get calls() {
      return calls;
    },
    asked: seen,
    down,
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
            messages: { role: string; content?: string | null }[];
            tools?: unknown[];
            reasoning_effort?: string;
          };
          seen.push({ model: asked.model, effort: asked.reasoning_effort ?? null });
          if (down.has(asked.model)) return send(503, { error: { message: 'stub: down' } });
          // As NEAR AI does for Anthropic's models (HTTP 400, seen 2026-11-06).
          if (asked.reasoning_effort && asked.model.startsWith('anthropic/')) {
            return send(400, { error: { message: 'reasoning_effort is not supported' } });
          }
          const from = asked.messages.findLastIndex((m) => m.role === 'user');
          // Refused for want of a yes (J4), or offered no tools after that, it asks. A real model keeps the
          // tools that only read and may go on, but the recording has nothing to go on with. A yes replays.
          const refused = asked.messages.at(-1)?.content?.includes('approval_required');
          const said: Pick<LlmCompletion, 'message'> =
            asked.tools?.length && !refused
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
