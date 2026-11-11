// annotate (Elco, 10 Nov; annotation-layer.md step 3): Petals' agent saves what the person tells it, or what
// it found, about an account into the person's project, in the same message as its answer: "this is Dekan's
// wallet" becomes a name kept privately. A round whose only calls are this one and name_conversation, each
// saved, ends the turn (run.ts), so saving costs no model call of its own; one that failed goes back to the
// model to fix. One per run: it knows which run, and so which project and whose account answers for it. It
// keeps them through the doors' own add_annotation, so the checks are one and the same.
import type { ToolError } from '@petal/core/types';
import { callTool, privateStore, runExplorationOf, type ToolContext } from '@petal/tools';
import type { AnyTool } from './tool-defs.ts';

export const ANNOTATE = 'annotate';
/** Petals' agent, as the tool that wrote it down (a claim's `via`). */
const VIA = 'tool:petals-agent@1';

const toolError = (code: ToolError['error']['code'], message: string): ToolError => ({
  error: { code, message },
});

/** The person's account, as a claim names who answers for it, or null for one with no wallet. */
export type AccountOf = (person: string) => Promise<string | null>;

export function annotateNotes(): string {
  return [
    '## Annotations',
    '',
    'When the person tells you who or what is behind an account ("this is Dekan\'s wallet"), or you find it, save it with annotate in the same message as your answer, and say in one line that it\'s kept in their project. What they tell you is stated. What a page or a proposal says is sourced, with its URL.',
  ].join('\n');
}

export function annotateTool(ctx: ToolContext, runId: string, accountOf?: AccountOf): AnyTool {
  return {
    name: ANNOTATE,
    input: {
      type: 'object',
      // the agent's tool list reads the description from here (tool-defs.ts)
      description:
        "Keep what the person tells you, or what you found, about accounts in their project, privately: a name (named), a note or research (noted), a link (linked), or a type (is_a: a DAO, a multisig, an exchange wallet, any word; several are several claims). subject is the account as Petals names it: eip155:<chain id>:0x… in lower case, or near:mainnet:<account>. kind: stated for what the person says, with no evidence; sourced for what a page or proposal says, with evidence [{ url, quote }]; inferred for what you worked out, with method petals-agent@1, qualifiers { grounds: 'research' } and evidence. One or many at once.",
      required: ['annotations'],
      properties: {
        annotations: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['subject', 'verb', 'object', 'kind'],
            properties: {
              subject: {
                type: 'string',
                description: 'eip155:100:0xabc…, near:mainnet:alice.near',
              },
              verb: { enum: ['named', 'noted', 'linked', 'is_a'] },
              object: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: {
                    type: 'string',
                    description: 'the name, the note, the link or the type',
                  },
                },
              },
              kind: { enum: ['stated', 'sourced', 'inferred'] },
              evidence: { type: 'array', items: { type: 'object' } },
              method: { type: 'string' },
              qualifiers: { type: 'object' },
            },
          },
        },
      },
      additionalProperties: false,
    },
    output: { type: 'object' },
    async run(args: Record<string, unknown>) {
      const owner = (await privateStore(ctx.config).run.get(runId))?.owner ?? null;
      const by = owner && accountOf ? await accountOf(owner) : null;
      if (!owner || !by) {
        return toolError(
          'unauthorised',
          "Only a signed-in person's conversation keeps annotations: they sign in with their wallet first.",
        );
      }
      const exploration = await runExplorationOf(ctx, runId);
      if (!exploration) {
        return toolError(
          'unauthorised',
          "This conversation isn't kept anywhere, so it can't keep annotations.",
        );
      }
      const annotations = (Array.isArray(args.annotations) ? args.annotations : []).map((a) => ({
        evidence: [],
        via: VIA,
        ...(a && typeof a === 'object' ? a : {}),
      }));
      return callTool(
        'add_annotation',
        { exploration, annotations },
        { ...ctx, caller: { subject: owner, by, door: 'site' } },
      );
    },
  };
}
