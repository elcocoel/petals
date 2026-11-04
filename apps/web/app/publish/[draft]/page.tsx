// The publish page (T066). /publish/<run_id>: the flower from a run of Petal's agent; the page
// calls prepare_publish itself. /publish/<entry_sha256>?nonce=…: a sign_url from prepare_publish,
// for a maker whose own agent made the flower; the page signs that prepared entry as it is.
import type { Run } from '@petal/core/types';
import { headers } from 'next/headers';
import { FlowerSheet } from '../../../components/FlowerSheet.tsx';
import { PublishFlow } from '../../../components/PublishFlow.tsx';
import { api } from '../../../lib/api.ts';
import { entryDraftFromRun } from '../../../lib/entry.ts';
import { renderSpec, sourceUrls } from '../../../lib/flower-data.ts';
import { publishTarget } from '../../../lib/publish.ts';

export const dynamic = 'force-dynamic';

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function PublishPage({
  params,
  searchParams,
}: {
  params: Promise<{ draft: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { draft } = await params;
  const target = publishTarget(draft, await searchParams);

  if (target.kind === 'bad') {
    return (
      <>
        <h1>Publish</h1>
        <p className="error">{target.error}</p>
      </>
    );
  }

  if (target.kind === 'prepared') {
    return (
      <>
        <h1>Publish a prepared flower</h1>
        <p>
          Your agent prepared this entry with <code>prepare_publish</code> and gave you this link to
          sign it. Only you can sign; Petal never asks for a key.
        </p>
        <PublishFlow prepared={target.prepared} />
      </>
    );
  }

  const got = await api<Run>(`/api/v1/agent/runs/${encodeURIComponent(target.run_id)}`);
  if (!got.ok) {
    return (
      <>
        <h1>Publish</h1>
        <p className="error">
          {got.error.code}: {got.error.message}
        </p>
      </>
    );
  }
  const run = got.value;
  const entry = entryDraftFromRun(run, await origin());
  if (!entry) {
    return (
      <>
        <h1>Publish</h1>
        <p>
          Run <a href={`/make?run=${encodeURIComponent(run.run_id)}`}>{run.run_id}</a> has no flower
          yet ({run.status}).
        </p>
      </>
    );
  }
  const [rendered, sources] = await Promise.all([
    renderSpec(entry.spec),
    sourceUrls(entry.spec.snapshot.sha256),
  ]);
  return (
    <>
      <h1>Publish: {entry.title ?? entry.spec.network.id}</h1>
      <p className="muted">
        From run <a href={`/make?run=${encodeURIComponent(run.run_id)}`}>{run.run_id}</a>.
      </p>
      {rendered.ok && <FlowerSheet spec={entry.spec} rendered={rendered.value} sources={sources} />}
      <PublishFlow draft={entry} />
    </>
  );
}
