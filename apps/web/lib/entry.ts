// Server only. The entry a maker publishes, built from a finished run of Petal's agent: the
// flower event (spec, interpretation, render hash), the signature event (if any) and the model.
import { TOOLS_VERSION } from '@petal/core';
import type { AgentEvent, ModelSignature, Run } from '@petal/core/types';
import type { EntryDraft } from './publish.ts';

const titleFrom = (question: string | undefined): string | undefined => {
  const q = question?.trim();
  if (!q) return undefined;
  return q.charAt(0).toUpperCase() + q.slice(1);
};

export function entryDraftFromRun(run: Run, origin: string): EntryDraft | null {
  const flower = run.flower;
  if (!flower) return null;
  const signature =
    run.events.findLast(
      (e): e is Extract<AgentEvent, { event: 'signature' }> => e.event === 'signature',
    )?.data ?? null;
  const done = run.events.findLast(
    (e): e is Extract<AgentEvent, { event: 'done' }> => e.event === 'done',
  )?.data;
  const sha = flower.spec.snapshot.sha256;
  const title = titleFrom(run.messages.filter((m) => m.role === 'user').at(-1)?.content);
  return {
    petal: 'flower/v1',
    ...(title ? { title } : {}),
    spec: flower.spec,
    spec_sha256: flower.spec_sha256,
    interpretation: flower.interpretation,
    snapshot: { sha256: sha, urls: [`${origin}/api/v1/snapshots/${sha}`] },
    render_sha256: flower.render_sha256,
    provenance: {
      agent: {
        kind: 'petal-agent',
        ...(done?.model ? { model: done.model } : {}),
        signature: signature as ModelSignature | null,
      },
      tools_version: TOOLS_VERSION,
      created_at: run.updated_at,
    },
  };
}
