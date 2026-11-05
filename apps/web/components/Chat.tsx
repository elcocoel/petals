'use client';
// The maker chat (T065, T166): reads like every AI chat. The box stays fixed at the bottom, the
// thread grows above it with the newest at the bottom, scrolled to the latest. POST
// /api/v1/agent/chat and read its SSE stream (http-api.md, Agent chat). The run_id from the first
// `run` event goes into the URL (/make?run=<id>); the next message sends it, so the server continues
// the run and the model keeps what it read. Opening that URL loads the stored run.
import type {
  AgentEvent,
  FlowerResult,
  LegendItem,
  ModelSignature,
  PetalDetail,
  Run,
} from '@petal/core/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseMarkdown } from '../lib/markdown.ts';
import { readSse } from '../lib/sse.ts';
import { blocksOf, type Done, fold, type Item, threadFromRun } from '../lib/thread.ts';
import { Flower } from './Flower.tsx';
import { Interpretation, SignatureLine } from './Interpretation.tsx';
import { Legend } from './Legend.tsx';
import { Markdown } from './Markdown.tsx';

/** What the recorded run (fixtures/transcripts/skeleton.json) was really asked. */
const RECORDED_QUESTION =
  "Who stands behind NEAR's validators? Make me a fresh flower with their backers, not an existing one.";

interface Drawn {
  svg: string;
  petals: PetalDetail[];
  legend: LegendItem[];
}

/** A flower in the thread, where it was made. It draws itself from its spec. */
function FlowerCard({
  flower,
  signature,
  recorded,
  showLink,
  publishUrl,
}: {
  flower: FlowerResult;
  signature: ModelSignature | null;
  recorded: boolean;
  /** the answer below has no link to this flower, so the card gives it */
  showLink: boolean;
  /** only on the run's latest flower: publishing takes the run's draft */
  publishUrl?: string;
}) {
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const specJson = JSON.stringify(flower.spec);

  useEffect(() => {
    let gone = false;
    void (async () => {
      const res = await fetch('/api/v1/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: `{"spec":${specJson},"include_svg":true}`,
      });
      const json = (await res.json()) as Partial<Drawn> & { error?: { message: string } };
      if (gone) return;
      if (res.ok && json.svg) {
        setDrawn({ svg: json.svg, petals: json.petals ?? [], legend: json.legend ?? [] });
      } else setFailed(json.error?.message ?? `HTTP ${res.status}`);
    })();
    return () => {
      gone = true;
    };
  }, [specJson]);

  return (
    <section className="box">
      {failed && <p className="error">The flower could not be drawn: {failed}</p>}
      {drawn ? (
        <Flower svg={drawn.svg} petals={drawn.petals} />
      ) : (
        !failed && <p className="muted">Drawing…</p>
      )}
      <Legend items={flower.legend} />
      {(showLink || publishUrl) && (
        <p>
          {showLink && (
            <a href={flower.view_url} target="_blank" rel="noreferrer">
              Open the flower
            </a>
          )}
          {showLink && publishUrl && ' · '}
          {publishUrl && <a href={publishUrl}>Publish on NEAR</a>}
        </p>
      )}
      <details>
        <summary>Interpretation, signature and checks</summary>
        <Interpretation reading={flower.interpretation} />
        <SignatureLine signature={signature} model={recorded ? 'recorded' : signature?.model} />
        <p>
          Valid: {String(flower.validation.valid)}
          {flower.validation.warnings.length > 0 &&
            ` (${flower.validation.warnings.map((w) => w.message).join('; ')})`}
          . spec_sha256 <code>{flower.spec_sha256}</code>
        </p>
      </details>
    </section>
  );
}

/** T168: which model really answered, and whether the answer has an enclave signature. */
export function AnsweredBy({ done, signature }: { done: Done; signature: ModelSignature | null }) {
  if (done.model === 'recorded') {
    return <p className="muted">Recorded run: no model answered just now.</p>;
  }
  if (done.turns === 0) return <p className="muted">No model answered.</p>;
  return (
    <p className="muted">
      Answered by <code>{done.model}</code>
      {done.fallback_used ? ' (a fallback: the first-choice model did not answer)' : ''}.{' '}
      {signature?.signature_kind === 'provider_tee' ? (
        <>
          Enclave signature: yes ({signature.signature_kind}, signer{' '}
          <code>{signature.signing_address}</code>
          {signature.attestation?.report_url && (
            <>
              , <a href={signature.attestation.report_url}>attestation report</a>
            </>
          )}
          ).
        </>
      ) : signature ? (
        <>
          Enclave signature: no. It has only a gateway signature, which does not prove which model
          answered.
        </>
      ) : (
        <>
          Enclave signature: no. NEAR AI gave no signature for this answer, so nothing proves which
          model wrote it. Only models with enclave attestation get one.
        </>
      )}{' '}
      {done.turns} model {done.turns === 1 ? 'call' : 'calls'}, ${done.cost_usd.toFixed(4)}.
    </p>
  );
}

export function Chat({
  initialRun,
  recorded = false,
  opening,
}: {
  initialRun?: string;
  recorded?: boolean;
  /** what the agent says first, on a new chat: written text, so opening the app costs no model call */
  opening?: string;
}) {
  const greeting = opening && !initialRun && !recorded ? opening : undefined;
  const [question, setQuestion] = useState('');
  const [items, setItems] = useState<Item[]>(greeting ? [{ kind: 'message', text: greeting }] : []);
  const [runId, setRunId] = useState<string | null>(initialRun ?? null);
  const [busy, setBusy] = useState(Boolean(initialRun));
  const thread = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const following = useRef(true);

  useEffect(() => {
    if (!recorded) box.current?.focus();
  }, [recorded]);

  const apply = useCallback((e: AgentEvent) => {
    if (e.event === 'run') {
      setRunId(e.data.run_id);
      window.history.replaceState(null, '', `/make?run=${encodeURIComponent(e.data.run_id)}`);
    }
    setItems((xs) => fold(xs, e));
  }, []);

  // Scrolled to the latest, also when a flower finishes drawing, unless the reader scrolled up.
  useEffect(() => {
    const toEnd = () => {
      if (following.current) window.scrollTo(0, document.documentElement.scrollHeight);
    };
    const onScroll = () => {
      const left = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      following.current = left < 120;
    };
    const watch = new ResizeObserver(toEnd);
    if (thread.current) watch.observe(thread.current);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      watch.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!initialRun) return;
    let gone = false;
    const url = `/api/v1/agent/runs/${encodeURIComponent(initialRun)}`;
    void (async () => {
      try {
        const res = await fetch(url);
        const json = (await res.json()) as Run & { error?: { code: string; message: string } };
        if (gone) return;
        if (!res.ok || json.error) {
          setItems([
            {
              kind: 'error',
              code: json.error?.code ?? 'not_found',
              message: json.error?.message ?? `HTTP ${res.status}`,
            },
          ]);
          return;
        }
        setItems(threadFromRun(json));
        if (json.status !== 'running') return;
        // still going: the stream replays what was stored, then follows it to the end
        const live = await fetch(url, { headers: { accept: 'text/event-stream' } });
        if (!live.body) return;
        let skip = json.events.length;
        for await (const m of readSse(live.body)) {
          if (gone) return;
          if (m.event === 'heartbeat' || skip-- > 0) continue;
          apply({ event: m.event, data: JSON.parse(m.data) } as AgentEvent);
        }
      } finally {
        if (!gone) setBusy(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [initialRun, apply]);

  async function send() {
    const text = recorded ? RECORDED_QUESTION : question.trim();
    if (!text || busy) return;
    // a recorded run can't go on from what was said: each play starts over
    const continuing = recorded ? null : runId;
    if (recorded) setItems([]);
    setItems((xs) => [...xs, { kind: 'user', text }]);
    setQuestion('');
    setBusy(true);
    following.current = true;
    try {
      const res = await fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        // only what is new: the server holds the conversation
        body: JSON.stringify({
          messages: [
            // the model should know what it has already said to this person
            ...(greeting && !continuing ? [{ role: 'assistant', content: greeting }] : []),
            { role: 'user', content: text },
          ],
          ...(continuing ? { run_id: continuing } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { code: string; message: string };
        };
        if (!recorded) setQuestion(text);
        throw new Error(
          json.error ? `${json.error.code}: ${json.error.message}` : `HTTP ${res.status}`,
        );
      }
      for await (const m of readSse(res.body)) {
        apply({ event: m.event, data: JSON.parse(m.data) } as AgentEvent);
      }
    } catch (e) {
      setItems((xs) => [
        ...xs,
        { kind: 'error', code: 'client', message: e instanceof Error ? e.message : String(e) },
      ]);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  }

  const blocks = blocksOf(items);
  const lastFlower = blocks.findLastIndex((b) => b.kind === 'flower');
  // one link per flower per turn: a fresh Set at each question, rebuilt on every render
  let seen = new Set<string>();

  return (
    <>
      <div className="thread" ref={thread}>
        {blocks.map((b, i) => {
          const key = `${i}-${b.kind}`;
          switch (b.kind) {
            case 'user':
              seen = new Set();
              return (
                <p key={key} className="you">
                  <strong>You:</strong> {b.text}
                </p>
              );
            case 'note':
              return (
                <p key={key} className="muted">
                  {b.text}
                </p>
              );
            case 'steps': {
              const tools = b.steps.filter((s) => s.kind === 'tool').length;
              const latest = b.steps.findLast((s) => s.kind === 'stage' || s.kind === 'progress');
              const running = busy && i === blocks.length - 1;
              if (!tools && !running) return null;
              return (
                <details key={key} className="steps">
                  <summary className="muted">
                    {running && latest ? `${(latest as { message: string }).message}… ` : ''}
                    {tools} {tools === 1 ? 'tool call' : 'tool calls'}
                  </summary>
                  <ol className="events">
                    {b.steps.map((s, k) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: the list only grows, in event order
                      <li key={k}>
                        {s.kind === 'stage' && (
                          <>
                            <em>{s.stage}</em>: {s.message}
                          </>
                        )}
                        {s.kind === 'progress' && (
                          <span className="muted">
                            {s.message}
                            {s.total ? ` (${s.done ?? 0}/${s.total})` : ''}
                          </span>
                        )}
                        {s.kind === 'tool' && (
                          <details>
                            <summary>
                              <code>{s.name}</code>{' '}
                              {s.result
                                ? `${s.result.ok ? 'ok' : 'failed'}: ${s.result.summary} (${s.result.ms} ms)`
                                : '…'}
                            </summary>
                            <pre>{JSON.stringify(s.args, null, 2)}</pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              );
            }
            case 'message':
              return <Markdown key={key} blocks={parseMarkdown(b.text, seen)} />;
            case 'flower': {
              // does this turn's own text link to it?
              const from = blocks.findLastIndex((x, n) => n <= i && x.kind === 'user');
              const next = blocks.findIndex((x, n) => n > i && x.kind === 'user');
              const linked = blocks
                .slice(Math.max(from, 0), next === -1 ? undefined : next)
                .some((x) => x.kind === 'message' && x.text.includes(b.flower.view_url));
              return (
                <FlowerCard
                  key={key}
                  flower={b.flower}
                  signature={b.signature}
                  recorded={recorded}
                  showLink={!linked}
                  {...(i === lastFlower && runId
                    ? { publishUrl: `/publish/${encodeURIComponent(runId)}` }
                    : {})}
                />
              );
            }
            case 'error':
              return (
                <p key={key} className="error">
                  {b.code}: {b.message}
                  {b.hint ? ` (${b.hint})` : ''}
                </p>
              );
            case 'done':
              return <AnsweredBy key={key} done={b.done} signature={b.signature} />;
            default:
              return null;
          }
        })}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="composer-row">
          <textarea
            ref={box}
            id="q"
            rows={2}
            aria-label={recorded ? 'The saved question' : 'Ask Petal’s agent about a network'}
            placeholder={
              runId ? 'Ask a follow-up…' : 'A DAO, a token, a contract address, or a question…'
            }
            value={recorded ? RECORDED_QUESTION : question}
            readOnly={recorded}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Working…' : recorded ? 'Play the recorded run' : 'Send'}
          </button>
        </div>
        {runId && (
          <p className="muted composer-note">
            Run <a href={`/make?run=${encodeURIComponent(runId)}`}>{runId}</a>: you can leave and
            come back to this link.
          </p>
        )}
      </form>
    </>
  );
}
