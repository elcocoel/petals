'use client';
// The maker chat (T065): POST /api/v1/agent/chat and read its SSE stream (http-api.md, Agent
// chat): stages, tool calls with their results, the agent's messages, and the flower inline.
// The run_id from the first `run` event goes into the URL (/make?run=<id>), so the run can be
// found again; opening that URL loads the stored run (GET /api/v1/agent/runs/:id).
import type {
  AgentEvent,
  ChatMessage,
  FlowerResult,
  LegendItem,
  ModelSignature,
  PetalDetail,
  Run,
} from '@petal/core/types';
import { useCallback, useEffect, useState } from 'react';
import { readSse } from '../lib/sse.ts';
import { Flower } from './Flower.tsx';
import { Interpretation, SignatureLine } from './Interpretation.tsx';
import { Legend } from './Legend.tsx';

const QUESTION = "who stands behind NEAR's validators?";
/** What the recorded run (fixtures/transcripts/skeleton.json) was really asked. */
const RECORDED_QUESTION =
  "Who stands behind NEAR's validators? Make me a fresh flower with their backers, not an existing one.";

type Item =
  | { kind: 'user'; text: string }
  | { kind: 'stage'; stage: string; message: string }
  | { kind: 'progress'; message: string; done?: number; total?: number }
  | {
      kind: 'tool';
      id: string;
      name: string;
      args: unknown;
      result?: { ok: boolean; summary: string; ms: number };
    }
  | { kind: 'message'; text: string }
  | { kind: 'error'; code: string; message: string; hint?: string };

type Done = Extract<AgentEvent, { event: 'done' }>['data'];
interface Drawn {
  svg: string;
  petals: PetalDetail[];
  legend: LegendItem[];
}

export function Chat({
  initialRun,
  recorded = false,
}: {
  initialRun?: string;
  recorded?: boolean;
}) {
  const [question, setQuestion] = useState(QUESTION);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [runId, setRunId] = useState<string | null>(initialRun ?? null);
  const [flower, setFlower] = useState<FlowerResult | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [signature, setSignature] = useState<ModelSignature | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);

  const draw = useCallback(async (f: FlowerResult) => {
    const res = await fetch('/api/v1/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec: f.spec, include_svg: true }),
    });
    const json = (await res.json()) as Partial<Drawn> & { error?: { message: string } };
    if (res.ok && json.svg) {
      setDrawn({ svg: json.svg, petals: json.petals ?? [], legend: json.legend ?? f.legend });
    } else {
      setItems((xs) => [
        ...xs,
        { kind: 'error', code: 'render', message: json.error?.message ?? `HTTP ${res.status}` },
      ]);
    }
  }, []);

  const apply = useCallback(
    (e: AgentEvent) => {
      switch (e.event) {
        case 'run':
          setRunId(e.data.run_id);
          window.history.replaceState(null, '', `/make?run=${encodeURIComponent(e.data.run_id)}`);
          break;
        case 'stage':
          setItems((xs) => [...xs, { kind: 'stage', ...e.data }]);
          break;
        case 'progress':
          setItems((xs) => [...xs, { kind: 'progress', ...e.data }]);
          break;
        case 'tool_call':
          setItems((xs) => [...xs, { kind: 'tool', ...e.data }]);
          break;
        case 'tool_result': {
          const { id, ok, summary, ms } = e.data;
          setItems((xs) =>
            xs.map((x) =>
              x.kind === 'tool' && x.id === id ? { ...x, result: { ok, summary, ms } } : x,
            ),
          );
          break;
        }
        case 'message':
          setItems((xs) => [...xs, { kind: 'message', text: e.data.text }]);
          setHistory((h) => [...h, { role: 'assistant', content: e.data.text }]);
          break;
        case 'flower':
          setFlower(e.data);
          void draw(e.data);
          break;
        case 'signature':
          setSignature(e.data);
          break;
        case 'error':
          setItems((xs) => [...xs, { kind: 'error', ...e.data }]);
          break;
        case 'done':
          setDone(e.data);
          break;
        case 'heartbeat':
          break;
      }
    },
    [draw],
  );

  const reset = () => {
    setFlower(null);
    setDrawn(null);
    setSignature(null);
    setDone(null);
  };

  useEffect(() => {
    if (!initialRun) return;
    let gone = false;
    void (async () => {
      const res = await fetch(`/api/v1/agent/runs/${encodeURIComponent(initialRun)}`);
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
      const user = json.messages.filter((m) => m.role === 'user').at(-1);
      setItems(user ? [{ kind: 'user', text: user.content }] : []);
      setHistory(json.messages.filter((m) => m.role === 'user'));
      for (const e of json.events) apply(e);
      if (json.status === 'running') {
        setItems((xs) => [
          ...xs,
          { kind: 'progress', message: 'Still running: reload to see more.' },
        ]);
      }
    })();
    return () => {
      gone = true;
    };
  }, [initialRun, apply]);

  async function send() {
    const text = question.trim();
    if (!text || busy) return;
    const messages: ChatMessage[] = [...history, { role: 'user', content: text }];
    setHistory(messages);
    setItems((xs) => [...xs, { kind: 'user', text }]);
    reset();
    setBusy(true);
    try {
      const res = await fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { code: string; message: string };
        };
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
    }
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="q">
          {recorded ? 'The saved question' : 'Ask Petal’s agent about a network'}
        </label>
        <textarea
          id="q"
          rows={2}
          value={recorded ? RECORDED_QUESTION : question}
          readOnly={recorded}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : recorded ? 'Play the recorded run' : 'Send'}
        </button>
      </form>
      {runId && (
        <p className="muted">
          Run <a href={`/make?run=${encodeURIComponent(runId)}`}>{runId}</a>: you can leave and come
          back to this link.
        </p>
      )}
      <ol className="events">
        {items.map((x, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the list only grows, in event order
          <li key={i}>
            {x.kind === 'user' && (
              <>
                <strong>You:</strong> {x.text}
              </>
            )}
            {x.kind === 'stage' && (
              <>
                <em>{x.stage}</em>: {x.message}
              </>
            )}
            {x.kind === 'progress' && (
              <span className="muted">
                {x.message}
                {x.total ? ` (${x.done ?? 0}/${x.total})` : ''}
              </span>
            )}
            {x.kind === 'tool' && (
              <details>
                <summary>
                  <code>{x.name}</code>{' '}
                  {x.result
                    ? `${x.result.ok ? 'ok' : 'failed'}: ${x.result.summary} (${x.result.ms} ms)`
                    : '…'}
                </summary>
                <pre>{JSON.stringify(x.args, null, 2)}</pre>
              </details>
            )}
            {x.kind === 'message' && (
              <>
                <strong>Petal:</strong> {x.text}
              </>
            )}
            {x.kind === 'error' && (
              <span className="error">
                {x.code}: {x.message}
                {x.hint ? ` (${x.hint})` : ''}
              </span>
            )}
          </li>
        ))}
      </ol>
      {flower && (
        <section className="box">
          <h2>The flower</h2>
          {drawn ? (
            <Flower svg={drawn.svg} petals={drawn.petals} />
          ) : (
            <p className="muted">Drawing…</p>
          )}
          <Legend items={flower.legend} />
          <Interpretation reading={flower.interpretation} />
          <SignatureLine signature={signature} model={recorded ? 'recorded' : done?.model} />
          <p>
            Valid: {String(flower.validation.valid)}
            {flower.validation.warnings.length > 0 &&
              ` (${flower.validation.warnings.map((w) => w.message).join('; ')})`}
            . spec_sha256 <code>{flower.spec_sha256}</code>
          </p>
          <p>
            <a href={flower.view_url}>Open as a draft</a>
            {runId && (
              <>
                {' · '}
                <a href={`/publish/${encodeURIComponent(runId)}`}>Publish on NEAR</a>
              </>
            )}
          </p>
        </section>
      )}
      {done && (
        <p className="muted">
          Done: model {done.model}
          {done.fallback_used ? ' (fallback)' : ''}, {done.turns} turns, tokens {done.tokens.in} in
          / {done.tokens.out} out, ${done.cost_usd.toFixed(4)}.
        </p>
      )}
    </>
  );
}
