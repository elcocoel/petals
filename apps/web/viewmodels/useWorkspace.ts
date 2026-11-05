// The ViewModel of the workspace: the conversation (useMakeChat) and the panel beside it. Which flower
// is open and which petal is selected are in the chat's reducer, so a new flower can take the panel;
// this draws what's needed, projects the panel, keeps the address in step and hears Escape.
import { useEffect, useMemo } from 'react';
import { type ListedFlower, svgImage } from '../lib/flower-view.ts';
import {
  composerTarget,
  flowerPanelView,
  type PanelFlower,
  type PanelView,
  questionPrefix,
  shelfView,
} from '../lib/panel-view.ts';
import type { Opened, PanelSection } from '../lib/thread.ts';
import { composerView, type FlowerRow, openFlowerIndex } from '../lib/thread-view.ts';
import { workspaceUrl } from '../lib/workspace-url.ts';
import { useDrawnFlowers } from './useDrawnFlower.ts';
import { useMakeChat } from './useMakeChat.ts';
import { useSnapshotFacts } from './useSnapshotFacts.ts';
import { useStoredFlower } from './useStoredFlower.ts';

const STORED_LINK = /^\/f\/([^/?#]+)$/;

export function useWorkspace(props: {
  initialRun?: string | undefined;
  recorded?: boolean;
  opening?: string;
  shelf: ListedFlower[];
  initialOpen?: Opened;
  initialPetal?: string | null;
}) {
  const { shelf, ...chatProps } = props;
  const { state: chat, dispatch, actions: chatActions, refs } = useMakeChat(chatProps);
  const { rows, open, petal, section, busy, runId, question, items, recorded } = chat;

  const turnFlowers = useMemo(
    () => rows.filter((r): r is FlowerRow => r.kind === 'flower'),
    [rows],
  );
  const storedId = open.kind === 'stored' ? open.id : null;
  const stored = useStoredFlower(storedId);
  const storedFlower = stored && 'flower' in stored ? stored.flower : null;

  // once read, the stored flower has its place in the thread
  useEffect(() => {
    if (!storedId || !storedFlower) return;
    const { entry } = storedFlower;
    dispatch({
      type: 'stored-read',
      stored: {
        kind: 'stored',
        id: storedId,
        question: entry.title ?? null,
        summary: entry.interpretation.summary,
        network: entry.spec.network.id,
        asOf: entry.spec.snapshot.as_of,
      },
    });
  }, [storedId, storedFlower, dispatch]);

  const inPanel = openFlowerIndex(open, turnFlowers.length);
  const panelFlower = useMemo<PanelFlower | null>(() => {
    if (open.kind === 'stored') {
      if (!storedFlower || !storedId) return null;
      const { entry } = storedFlower;
      return {
        key: entry.spec_sha256,
        spec: entry.spec,
        legend: [],
        interpretation: entry.interpretation,
        signature: entry.provenance.agent.signature ?? null,
        ...(entry.provenance.agent.model ? { model: entry.provenance.agent.model } : {}),
        checks: `Entry ${entry.id}`,
        viewUrl: `/f/${encodeURIComponent(storedId)}`,
        stored: { id: storedId, title: entry.title ?? null },
        earlier: false,
      };
    }
    const row = turnFlowers[inPanel];
    if (!row) return null;
    return {
      key: row.flower.spec_sha256,
      spec: row.flower.spec,
      legend: row.flower.legend,
      interpretation: row.flower.interpretation,
      signature: row.signature,
      ...(row.model ? { model: row.model } : {}),
      checks: row.checks,
      viewUrl: row.flower.view_url,
      ...(row.publishUrl ? { publishUrl: row.publishUrl } : {}),
      earlier: inPanel !== turnFlowers.length - 1,
    };
  }, [open.kind, storedFlower, storedId, turnFlowers, inPanel]);

  const toDraw = useMemo(
    () => [
      ...turnFlowers.map((r) => ({ key: r.flower.spec_sha256, spec: r.flower.spec })),
      ...(storedFlower
        ? [{ key: storedFlower.entry.spec_sha256, spec: storedFlower.entry.spec }]
        : []),
    ],
    [turnFlowers, storedFlower],
  );
  const drawings = useDrawnFlowers(toDraw);
  const thumbs = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(drawings).flatMap(([key, d]) => (d.svg ? [[key, svgImage(d.svg)]] : [])),
      ) as Record<string, string>,
    [drawings],
  );
  const facts = useSnapshotFacts(panelFlower?.spec.snapshot.sha256 ?? null);
  const drawing = panelFlower ? drawings[panelFlower.key] : undefined;
  const selectedPetal = drawing?.petals?.find((p) => p.id === petal) ?? null;

  const panel = useMemo<PanelView>(() => {
    if (panelFlower) {
      return flowerPanelView({
        flower: panelFlower,
        drawing,
        selected: petal,
        sources: facts.sources,
        units: facts.units,
      });
    }
    if (stored && 'failed' in stored) return { kind: 'failed', text: stored.failed };
    if (storedId) return { kind: 'loading', text: 'Opening the flower…' };
    // a stored run on its way back: its flowers will be here in a moment
    if (runId && items.length === 0 && busy) return { kind: 'loading', text: 'Opening…' };
    return shelfView(shelf, busy, recorded);
  }, [
    panelFlower,
    drawing,
    petal,
    facts,
    stored,
    storedId,
    runId,
    items.length,
    busy,
    shelf,
    recorded,
  ]);

  const target = useMemo(
    () => composerTarget(panelFlower, selectedPetal),
    [panelFlower, selectedPetal],
  );
  const composer = composerView({ question, runId, busy, recorded, target });

  // the address holds what a reload needs
  useEffect(() => {
    const url = workspaceUrl({ runId, open, petal });
    if (url) window.history.replaceState(null, '', url);
  }, [runId, open, petal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'select', petal: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const openStored = (id: string) => dispatch({ type: 'open', open: { kind: 'stored', id } });

  return {
    state: {
      rows,
      composer,
      panel,
      petal: selectedPetal,
      unit: panelFlower && facts.units[panelFlower.spec.selection.measure],
      section,
      thumbs,
      heading: open.kind === 'stored' ? 'Continue this flower' : 'Conversation',
      recorded,
    },
    actions: {
      setQuestion: chatActions.setQuestion,
      send: () => chatActions.send(questionPrefix(panelFlower, target)),
      refollow: chatActions.refollow,
      openTurn: (index: number) =>
        dispatch({
          type: 'open',
          // the newest is what `latest` already means, and it keeps following
          open: index === turnFlowers.length - 1 ? { kind: 'latest' } : { kind: 'turn', index },
        }),
      openStored,
      showShelf: () => dispatch({ type: 'open', open: { kind: 'shelf' } }),
      select: (id: string | null) => {
        dispatch({ type: 'select', petal: id });
        // you've picked who you're asking about: the next thing is to ask
        if (id) refs.box.current?.focus({ preventScroll: true });
      },
      closeDetail: () => dispatch({ type: 'select', petal: null }),
      setSection: (next: PanelSection) => dispatch({ type: 'section', section: next }),
      startFrom: (text: string) => {
        chatActions.setQuestion(text);
        refs.box.current?.focus();
      },
      /** A link in the agent's words to a stored flower opens it here. */
      followLink: (href: string) => {
        const id = STORED_LINK.exec(href)?.[1];
        if (id) openStored(decodeURIComponent(id));
        return Boolean(id);
      },
    },
    refs,
  };
}
