// The ViewModel of the workspace: the conversation (useMakeChat), the flower on the canvas under it and
// the panel that opens over it. Which flower is open and which petal is selected are in the chat's reducer,
// so a new flower can take them; this draws what's needed, projects the panel, says whether its box is
// open, keeps the address in step and hears Escape.
import { useEffect, useMemo, useState } from 'react';
import { saveSettings } from '../lib/agent-client.ts';
import {
  type Catalogue,
  modelOptions,
  modelPill,
  type Settings,
  withModel,
} from '../lib/composer-options.ts';
import { conversationRows } from '../lib/conversation-list.ts';
import { elsewhereFlower, elsewhereRows, whereOf } from '../lib/elsewhere.ts';
import { type ListedFlower, svgImage } from '../lib/flower-view.ts';
import {
  addressOpensBox,
  type CanvasFlower,
  type CanvasHit,
  canvasPetal,
  canvasShown,
  composerTarget,
  flowerPanelView,
  nextCanvas,
  type PanelFlower,
  type PanelView,
  panelFailure,
  pickPlan,
  questionPrefix,
  shelfView,
} from '../lib/panel-view.ts';
import type { Opened, PanelSection } from '../lib/thread.ts';
import { composerView, type FlowerRow, openFlowerIndex } from '../lib/thread-view.ts';
import { workspaceUrl } from '../lib/workspace-url.ts';
import { useConversationFacts } from './useConversationFacts.ts';
import { useConversations } from './useConversations.ts';
import { useDrawnFlowers } from './useDrawnFlower.ts';
import { useElsewhere } from './useElsewhere.ts';
import { useMakeChat } from './useMakeChat.ts';
import { useSession } from './useSession.ts';
import { useSnapshotFacts } from './useSnapshotFacts.ts';
import { useStoredFlower } from './useStoredFlower.ts';

const STORED_LINK = /^\/f\/([^/?#]+)$/;

export function useWorkspace(props: {
  initialRun?: string | undefined;
  /** a conversation happening in another agent: nothing in this page's chat is that conversation */
  initialElsewhere?: string | undefined;
  initialQuestion?: string | null;
  recorded?: boolean;
  opening?: string;
  shelf: ListedFlower[];
  initialOpen?: Opened;
  initialPetal?: string | null;
  /** What stands on the canvas until the conversation draws its own. */
  standIn: CanvasFlower | null;
  /** What a person can pick from. Null: the API couldn't say, so there's nothing to pick. */
  catalogue?: Catalogue | null;
}) {
  const { shelf, standIn, initialElsewhere, catalogue = null, ...chatProps } = props;
  const { state: chat, dispatch, actions: chatActions, refs } = useMakeChat(chatProps);
  const { rows, open, petal, section, busy, runId, question, items, recorded, asked } = chat;

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

  const { ref: elsewhereRef, read: elsewhere } = useElsewhere(initialElsewhere ?? null);
  const elsewherePacket = elsewhere && 'packet' in elsewhere ? elsewhere.packet : null;
  const shownRows = useMemo(
    () => (initialElsewhere ? elsewhereRows(elsewhere) : rows),
    [initialElsewhere, elsewhere, rows],
  );

  const inPanel = openFlowerIndex(open, turnFlowers.length);
  const panelFlower = useMemo<PanelFlower | null>(() => {
    if (initialElsewhere) return elsewhereFlower(elsewherePacket);
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
  }, [initialElsewhere, elsewherePacket, open.kind, storedFlower, storedId, turnFlowers, inPanel]);

  const toDraw = useMemo(
    () => [
      ...turnFlowers.map((r) => ({ key: r.flower.spec_sha256, spec: r.flower.spec })),
      ...(elsewherePacket?.current
        ? [{ key: elsewherePacket.current.spec_sha256, spec: elsewherePacket.current.spec }]
        : []),
      ...(storedFlower
        ? [{ key: storedFlower.entry.spec_sha256, spec: storedFlower.entry.spec }]
        : []),
    ],
    [turnFlowers, elsewherePacket, storedFlower],
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

  // Adjusted during render, as React allows, so the canvas never paints a frame behind the panel.
  const [canvas, setCanvas] = useState<CanvasFlower | null>(null);
  const nextHeld = nextCanvas(canvas, panelFlower?.key, drawing?.reading, panelFlower?.stored?.id);
  if (nextHeld !== canvas) setCanvas(nextHeld);

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
    if (initialElsewhere && !elsewhere) return { kind: 'loading', text: 'Opening…' };
    if (stored && 'failed' in stored) return { kind: 'failed', text: stored.failed };
    if (storedId) return { kind: 'loading', text: 'Opening the flower…' };
    // a stored run on its way back: its flowers will be here in a moment
    if (runId && items.length === 0 && busy) return { kind: 'loading', text: 'Opening…' };
    return shelfView(shelf, busy, recorded);
  }, [
    panelFlower,
    initialElsewhere,
    elsewhere,
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

  // What the address brought back isn't known until it's here, so nothing should stand in for it yet.
  // It only ever ends: later, a flower on its way takes over from whatever is on the canvas.
  const [comingBack, setComingBack] = useState(
    Boolean(props.initialRun || initialElsewhere) || props.initialOpen?.kind === 'stored',
  );
  if (comingBack && panel.kind !== 'loading' && (!panelFlower || drawing)) setComingBack(false);

  // box.close
  // Closed so the flower stays clear, until something asks for it. It can't stay closed on a failure.
  const [boxOpen, setBoxOpen] = useState(addressOpensBox(props.initialOpen, props.initialPetal));
  const failure = panelFailure(panel);
  const [saidFailure, setSaidFailure] = useState<string | null>(null);
  if (failure !== saidFailure) {
    setSaidFailure(failure);
    if (failure) setBoxOpen(true);
  }

  // Read when the page opens, and again when a turn starts or ends here: nothing runs on a timer.
  const session = useSession(!recorded);
  // Another agent's conversation needs no wallet here: nothing here is spent on it.
  const needsWallet = !recorded && !initialElsewhere && session.known && !session.account;
  // Until the server has said who's here, nothing offers to ask or to connect.
  const composerShown = recorded || Boolean(initialElsewhere) || Boolean(session.account);
  const listed = useConversations(recorded ? null : `${runId}:${busy}:${elsewhereRef}`);
  const conversations = useMemo(
    () => conversationRows(listed, { runId, elsewhere: elsewhereRef ?? undefined }),
    [listed, runId, elsewhereRef],
  );
  // box.close
  // Coming back with nothing in hand, the list is what there is to do. A person's choice wins from then on.
  const [listChoice, setListChoice] = useState<boolean | null>(null);
  const cameBare =
    !props.initialRun && !initialElsewhere && !props.initialQuestion && !props.initialPetal;
  const nothingOpened = (props.initialOpen?.kind ?? 'latest') === 'latest';
  const hasList = conversations.length > 0 || Boolean(session.account);
  const listOpen = listChoice ?? (cameBare && nothingOpened && hasList);

  // Another agent's conversation has only its own flowers: a stand-in would read as one of them.
  const onCanvas = canvasShown(canvas, comingBack, initialElsewhere ? null : standIn);
  // The canvas's flower is the panel's, or is on its way there: only then does it have a selected petal.
  const canvasIsOpen =
    Boolean(onCanvas) &&
    (onCanvas?.key === panelFlower?.key || (storedId !== null && onCanvas?.stored === storedId));

  const target = useMemo(
    () => composerTarget(panelFlower, selectedPetal),
    [panelFlower, selectedPetal],
  );
  // A pick holds from now on. It's kept at once on a conversation that's going, and goes with the first
  // message on a new one.
  const conversation = useConversationFacts(initialElsewhere ? null : runId, busy);
  const [picked, setPicked] = useState<Settings | null>(null);
  const settings = picked ?? conversation?.settings ?? catalogue?.default ?? null;
  const showModel = Boolean(catalogue && settings && !recorded && !initialElsewhere);
  const [modelsOpen, setModelsOpen] = useState(false);

  // The box's cursor once there's a box to be in, after the server says who's here.
  const box = refs.box;
  useEffect(() => {
    if (session.account && !initialElsewhere) box.current?.focus();
  }, [session.account, initialElsewhere, box]);

  const composer = composerView({
    question,
    runId,
    busy,
    recorded,
    target,
    elsewhere: initialElsewhere ? whereOf(elsewhere) : undefined,
  });

  // the address holds what a reload needs
  useEffect(() => {
    const url = workspaceUrl({ runId, open, petal, asked, elsewhere: elsewhereRef });
    if (url) window.history.replaceState(null, '', url);
  }, [runId, open, petal, asked, elsewhereRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'select', petal: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const openStored = (id: string) => {
    dispatch({ type: 'open', open: { kind: 'stored', id } });
    setBoxOpen(true);
  };
  const select = (id: string | null) => {
    dispatch({ type: 'select', petal: id });
    // you've picked who you're asking about: the next thing is to ask
    if (id) refs.box.current?.focus({ preventScroll: true });
  };

  return {
    state: {
      rows: shownRows,
      composer,
      panel,
      onCanvas,
      selected: canvasIsOpen ? petal : null,
      boxOpen,
      petal: selectedPetal && canvasPetal(selectedPetal),
      unit: panelFlower && facts.units[panelFlower.spec.selection.measure],
      section,
      thumbs,
      heading:
        open.kind === 'stored'
          ? 'Continue this flower'
          : (conversations.find((c) => c.current)?.title ??
            elsewherePacket?.question ??
            'Conversation'),
      conversations,
      hasList,
      listOpen,
      session,
      needsWallet,
      composerShown,
      question,
      pill:
        showModel && catalogue && settings
          ? modelPill(catalogue, settings, conversation?.answered ?? null)
          : null,
      models: showModel && catalogue && settings ? modelOptions(catalogue, settings) : [],
      modelsOpen: showModel && modelsOpen,
      recorded,
    },
    actions: {
      setQuestion: chatActions.setQuestion,
      send: () => chatActions.send(questionPrefix(panelFlower, target), picked ?? undefined),
      toggleModels: () => setModelsOpen(!modelsOpen),
      pickModel: (id: string) => {
        if (!catalogue || !settings) return;
        const next = withModel(catalogue, settings, id);
        setPicked(next);
        setModelsOpen(false);
        if (runId) void saveSettings(runId, next);
      },
      refollow: chatActions.refollow,
      openTurn: (index: number) => {
        dispatch({
          type: 'open',
          // the newest is what `latest` already means, and it keeps following
          open: index === turnFlowers.length - 1 ? { kind: 'latest' } : { kind: 'turn', index },
        });
        // still being drawn, and someone asked for it: it shouldn't be silent
        const asked = turnFlowers[index];
        if (asked && !drawings[asked.flower.spec_sha256]) setBoxOpen(true);
      },
      openStored,
      showShelf: () => dispatch({ type: 'open', open: { kind: 'shelf' } }),
      /** A click on the canvas. */
      pick: (hit: CanvasHit) => {
        const { actions: asked, opensBox } = pickPlan(
          hit,
          onCanvas,
          panelFlower?.key,
          turnFlowers.map((r) => r.flower.spec_sha256),
        );
        for (const action of asked) {
          if (action.type === 'select') select(action.petal);
          else dispatch(action);
        }
        if (opensBox) setBoxOpen(true);
      },
      closeBox: () => setBoxOpen(false),
      toggleList: () => setListChoice(!listOpen),
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
