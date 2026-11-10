// name_conversation (Elco, 10 Nov): Petals' agent names each conversation after its first answer and
// renames it when the subject changes. It calls this in the same message as its answer, and a round whose
// only calls are this one ends the turn (run.ts), so a name costs no model call of its own. One per run:
// it knows which run it names. Only Petals' agent has it; the person's own agents send a title with
// add_note instead.
import type { ToolError } from '@petal/core/types';
import { CONVERSATION_TITLE_MAX, privateStore, type ToolContext } from '@petal/tools';
import type { AnyTool } from './tool-defs.ts';

export const NAME_CONVERSATION = 'name_conversation';

const toolError = (code: ToolError['error']['code'], message: string): ToolError => ({
  error: { code, message },
});

/** What the system message says of the conversation's name: none yet, or the one it has. */
export interface RunName {
  title: string | null;
  named: boolean;
}

export async function nameOfRun(ctx: ToolContext, runId: string): Promise<RunName | null> {
  const run = await privateStore(ctx.config).run.get(runId);
  return run ? { title: run.title ?? null, named: Boolean(run.named_at) } : null;
}

export function nameNotes(name: RunName): string {
  return [
    "## This conversation's name",
    '',
    name.named && name.title
      ? `It's called "${name.title}". If the subject has changed, call name_conversation with a new name in the same message as your answer.`
      : 'It has no name yet. In the same message as your answer, call name_conversation.',
  ].join('\n');
}

export function nameConversationTool(ctx: ToolContext, runId: string): AnyTool {
  return {
    name: NAME_CONVERSATION,
    input: {
      type: 'object',
      // the agent's tool list reads the description from here (tool-defs.ts)
      description:
        "Name this conversation in the person's list: 3 to 6 plain words, the subject, not the request. Call it in the same message as your answer, never on its own.",
      required: ['title'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: CONVERSATION_TITLE_MAX },
      },
      additionalProperties: false,
    },
    output: { type: 'object' },
    async run(args: Record<string, unknown>) {
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (!title || title.length > CONVERSATION_TITLE_MAX) {
        return toolError('bad_input', `title is 1 to ${CONVERSATION_TITLE_MAX} characters`);
      }
      const store = privateStore(ctx.config);
      const run = await store.run.get(runId);
      if (!run) {
        return toolError(
          'not_found',
          "This conversation isn't kept anywhere, so it can't be named.",
        );
      }
      await store.run.setTitle(runId, title, ctx.now().toISOString());
      // the search finds it by its new name
      if (run.owner) await store.search.forget(run.owner, 'conversation', runId);
      return { title };
    },
  };
}
