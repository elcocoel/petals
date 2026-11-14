// The ViewModel of the workspace: the conversation (useMakeChat), the flower on the canvas under it and
// the panel that opens over it. Which flower is open and which petal is selected are in the chat's reducer,
// so a new flower can take them; this draws what's needed, projects the panel, says whether its box is
// open, keeps the address in step and hears Escape.
import { accountRef } from '@petal/core';
import type { Spec } from '@petal/core/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapWallet } from '../landscape/LandscapeCanvas.tsx';
import { readDrawingSpec, readMapDrawing, saveSettings } from '../lib/agent-client.ts';
import { aboutLine } from '../lib/ask-about.ts';
import { ceremonyWords, creating, making, turnShow } from '../lib/ceremony.ts';
import {
  type Catalogue,
  modelOptions,
  modelPill,
  type Settings,
  withModel,
} from '../lib/composer-options.ts';
import { decodeDraft } from '../lib/draft.ts';
import { drawingLink, mapLink } from '../lib/drawing-link.ts';
import { elsewhereFlower, elsewhereRows, whereOf } from '../lib/elsewhere.ts';
import { populationWords, svgImage } from '../lib/flower-view.ts';
import type { InFront } from '../lib/in-front.ts';
import type { Mode } from '../lib/mapping.ts';
import type { MapCard } from '../lib/maps.ts';
import {
  addressOpensBox,
  type CanvasFlower,
  type CanvasHit,
  canvasPetal,
  composerTarget,
  draftPanelFlower,
  flowerPanelView,
  nextCanvas,
  type PanelFlower,
  type PanelView,
  panelFailure,
  pickPlan,
  questionPrefix,
  shelfView,
  storedPanelFlower,
} from '../lib/panel-view.ts';
import { payWords } from '../lib/pay.ts';
import type { Opened, PanelSection } from '../lib/thread.ts';
import {
  type ComposerTarget,
  composerView,
  type FlowerRow,
  openFlowerIndex,
} from '../lib/thread-view.ts';
import { petalWorth } from '../lib/value-view.ts';
import { conversationAt, workspaceUrl } from '../lib/workspace-url.ts';
import { useConversationFacts } from './useConversationFacts.ts';
import { useDrawnFlowers } from './useDrawnFlower.ts';
import { useElsewhere } from './useElsewhere.ts';
import { useJobControls } from './useJobControls.ts';
import { useJobs } from './useJobs.ts';
import { useMakeChat } from './useMakeChat.ts';
import { useMapValue } from './useMapValue.ts';
import { useMapVotes } from './useMapVotes.ts';
import { usePersonView } from './usePersonView.ts';
import { useSession } from './useSession.ts';
import { useSnapshotFacts } from './useSnapshotFacts.ts';
import { useStoredFlower } from './useStoredFlower.ts';
import { useWorkPanel } from './useWorkPanel.ts';

export function useWorkspace(props: {
  initialRun?: string | undefined;
  /** a conversation happening in another agent: nothing in this page's chat is that conversation */
  initialElsewhere?: string | undefined;
  initialQuestion?: string | null;
  recorded?: boolean;
  shelf: MapCard[];
  initialOpen?: Opened;
  initialPetal?: string | null;
  /** What a person can pick from. Null: the API couldn't say, so there's nothing to pick. */
  catalogue?: Catalogue | null;
}) {
  const { shelf, initialElsewhere, catalogue = null, ...chatProps } = props;
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
    // a drawing a link in the conversation opened: on the canvas beside it, whatever the conversation is
    if (open.kind === 'draft') return draftPanelFlower(open.spec);
    if (initialElsewhere) return elsewhereFlower(elsewherePacket);
    if (open.kind === 'stored') {
      if (!storedFlower || !storedId) return null;
      return storedPanelFlower(storedFlower.entry, storedId, `/f/${encodeURIComponent(storedId)}`);
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
  }, [initialElsewhere, elsewherePacket, open, storedFlower, storedId, turnFlowers, inPanel]);

  const toDraw = useMemo(
    () => [
      ...turnFlowers.map((r) => ({ key: r.flower.spec_sha256, spec: r.flower.spec })),
      ...(elsewherePacket?.current
        ? [{ key: elsewherePacket.current.spec_sha256, spec: elsewherePacket.current.spec }]
        : []),
      ...(storedFlower
        ? [{ key: storedFlower.entry.spec_sha256, spec: storedFlower.entry.spec }]
        : []),
      ...(open.kind === 'draft' ? [{ key: draftPanelFlower(open.spec).key, spec: open.spec }] : []),
    ],
    [turnFlowers, elsewherePacket, storedFlower, open],
  );
  const person = usePersonView();
  const drawings = useDrawnFlowers(toDraw, person);
  const thumbs = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(drawings).flatMap(([key, d]) => (d.svg ? [[key, svgImage(d.svg)]] : [])),
      ) as Record<string, string>,
    [drawings],
  );
  const facts = useSnapshotFacts(panelFlower?.spec.snapshot.sha256 ?? null);
  const mapValue = useMapValue(panelFlower?.spec);
  const mapVotes = useMapVotes(panelFlower?.spec);
  const drawing = panelFlower ? drawings[panelFlower.key] : undefined;
  const selectedPetal = drawing?.petals?.find((p) => p.id === petal) ?? null;

  // Adjusted during render, as React allows, so the canvas never paints a frame behind the panel.
  const [canvas, setCanvas] = useState<CanvasFlower | null>(null);
  const nextHeld = nextCanvas(
    canvas,
    panelFlower?.key,
    drawing?.reading,
    panelFlower?.stored?.id,
    person.hash,
  );
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
  // Until the server has said who's here, nothing offers to send or to connect.
  const composerShown = recorded || Boolean(initialElsewhere) || Boolean(session.account);
  // Jobs handed to the person's own agent, in the conversation the newest one names.
  const jobsIn = useMemo(
    () => items.findLast((i) => i.kind === 'job')?.job.exploration ?? null,
    [items],
  );
  const jobs = useJobs(jobsIn);
  // the person's say over them: stop, send again, hand to another agent (swarm.md, step 3)
  const jobControls = useJobControls();
  // A report landed: Petals' agent takes it up at once, in this run, so the page follows that turn.
  const reported = useRef<Set<string>>(new Set());
  const follow = chatActions.follow;
  useEffect(() => {
    const ended = Object.values(jobs).filter((j) => j.status === 'done' || j.status === 'failed');
    const fresh = ended.filter((j) => !reported.current.has(j.id));
    for (const j of ended) reported.current.add(j.id);
    if (fresh.length > 0) follow();
  }, [jobs, follow]);
  // The side panel is the layout's (app/(work)/WorkPanel.tsx), so it stays while conversations change. It
  // reads its list and agents again when a turn starts or ends, the conversation changes or a job moves,
  // and it shows the name Petals' agent gives this conversation as it arrives (the `title` event).
  const panelBus = useWorkPanel();
  const { touch, name, claim } = panelBus;
  const jobsSignal = `${Object.keys(jobs).length}:${JSON.stringify(Object.values(jobs).map((j) => j.status))}`;
  useEffect(() => {
    if (!recorded) touch(`${runId}:${busy}:${elsewhereRef}:${jobsSignal}`);
  }, [touch, recorded, runId, busy, elsewhereRef, jobsSignal]);
  const named = chat.named;
  useEffect(() => name(named), [name, named]);
  // the one balance (useFunds, in the layout): read again after each turn, and after a payment lands
  const funds = panelBus.person?.funds;
  // Credit is added in the lobby's Balance, not in the conversation: with none left, the composer points there.
  const threadRows = shownRows;
  const noCredit = !recorded && !initialElsewhere && funds?.balance?.usd === '0.00';

  // Only the conversation's own flower stands on the canvas: before it draws one, it's empty ground.
  const onCanvas = canvas;
  // A link in the conversation to the Power Map or a map on it opens the map here, at that map, rather than
  // leading off /make. It stays until a flower is opened, or a new one is drawn.
  const [mapAt, setMapAt] = useState<{ map: string | null } | null>(null);
  // a wallet chosen on the map on the canvas (the map's wallet level): the question is about it
  const [mapWallet, setMapWallet] = useState<MapWallet | null>(null);
  // what the canvas has open (the map entered, the flower drawn apart, the layers on, what's chosen), told by the
  // surface as it changes and sent with every turn, so "this" means it; read at the send, it draws nothing
  const front = useRef<InFront | null>(null);
  const tellFront = useCallback((f: InFront) => {
    front.current = f;
  }, []);
  // the services under a map's next steps, folded until pressed (one list at a time: the last turn's)
  const [nextMore, setNextMore] = useState(false);
  // exploring what's there, or mapping: what the person would add, in their name (lib/mapping.ts)
  const [mode, setMode] = useState<Mode>('exploring');
  // a new read the person said yes to puts them in mapping, where what it adds shows
  const reading = creating(items, busy);
  const [wasReading, setWasReading] = useState(reading);
  if (reading !== wasReading) {
    setWasReading(reading);
    if (reading) setMode('mapping');
  }
  const [drawnKey, setDrawnKey] = useState(canvas?.key);
  if (canvas?.key !== drawnKey) {
    setDrawnKey(canvas?.key);
    if (mapAt) setMapAt(null);
  }
  // The canvas's flower is the panel's, or is on its way there: only then does it have a selected petal.
  const canvasIsOpen =
    Boolean(onCanvas) &&
    (onCanvas?.key === panelFlower?.key || (storedId !== null && onCanvas?.stored === storedId));

  // With the map on the canvas from a link, the question isn't about the flower left behind it (else the
  // field would say 'About this flower…' over the whole map).
  // A wallet chosen on the map: the question is about that wallet, so the agent can find out more about it.
  const target = useMemo(
    (): ComposerTarget =>
      mapWallet
        ? {
            kind: 'wallet',
            line: aboutLine({
              kind: 'mapWallet',
              id: accountRef(mapWallet.chain, mapWallet.id) ?? `${mapWallet.chain}:${mapWallet.id}`,
              flower: mapWallet.flower,
            }),
          }
        : mapAt
          ? composerTarget(null, null)
          : composerTarget(panelFlower, selectedPetal),
    [mapWallet, mapAt, panelFlower, selectedPetal],
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
    unavailable: Boolean(elsewhere && 'failed' in elsewhere),
    creating: reading,
    mode,
  });

  // the address holds what a reload needs, while it's still this conversation's: once a move has put
  // another conversation's address there (a link, New, or a delete opening a new one), this one, still
  // showing until the next one's data arrives, leaves it alone
  const ownAddress = useRef(
    conversationAt({ run: props.initialRun, elsewhere: initialElsewhere ?? undefined }),
  );
  useEffect(() => {
    const url = workspaceUrl({ runId, open, petal, asked, elsewhere: elsewhereRef });
    if (!url) return;
    // another page's address (the lobby, mid-move) isn't this conversation's, whatever its search says
    if (window.location.pathname !== '/make') return;
    const showing = conversationAt(
      Object.fromEntries(new URLSearchParams(window.location.search)) as Record<string, string>,
    );
    if (showing !== ownAddress.current) return;
    // Writing the address it already has changes nothing, and Next takes every write as a restore, which
    // cancels a move under way (a delete opening a new conversation was undone so).
    if (url === `${window.location.pathname}${window.location.search}`) return;
    // the page writes its own address: the panel mustn't take it for a move
    claim(url);
    window.history.replaceState(null, '', url);
    ownAddress.current = conversationAt(
      Object.fromEntries(new URL(url, window.location.origin).searchParams) as Record<
        string,
        string
      >,
    );
  }, [claim, runId, open, petal, asked, elsewhereRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'select', petal: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const openStored = (id: string) => {
    setMapAt(null);
    dispatch({ type: 'open', open: { kind: 'stored', id } });
    setBoxOpen(true);
  };
  const openDraft = (spec: Spec) => {
    // one this conversation drew opens as its own turn's flower, with what the agent said of it
    const key = draftPanelFlower(spec).key;
    const index = turnFlowers.findIndex((r) => r.flower.spec_sha256 === key);
    const open: Opened =
      index < 0
        ? { kind: 'draft', spec }
        : index === turnFlowers.length - 1
          ? { kind: 'latest' }
          : { kind: 'turn', index };
    setMapAt(null);
    dispatch({ type: 'open', open });
    setBoxOpen(true);
  };
  const select = (id: string | null) => {
    dispatch({ type: 'select', petal: id });
    // you've picked who you're asking about: the next thing is to ask
    if (id) refs.box.current?.focus({ preventScroll: true });
  };

  return {
    state: {
      /** This conversation, by its run or another door's id: where a note about a petal is kept. */
      conversationRef: runId ?? elsewhereRef ?? null,
      /** a turn is running: nothing more can be sent until it ends */
      busy,
      rows: threadRows,
      composer,
      panel,
      onCanvas,
      /** what the last answer is about on the Power Map (the server's show): the map moves to it */
      mapShow: turnShow(items),
      /** a new map being made: the held read the person said yes to, what it's doing, and its flower once drawn */
      making: making(items, busy),
      /** the readings drawn here, by their spec's hash: a new map's lands on the Power Map */
      drawings,
      nextMore,
      mode,
      /** the wallet chosen on the map (the wallet level), or null */
      mapWallet,
      /** the snapshot the conversation's flower reads, which the Power Map may hold as one of its flowers */
      flowerSnapshot: panelFlower?.spec.snapshot.sha256 ?? null,
      /** the canvas flower's map's proposals on the ring, once it's the panel's */
      votes: canvasIsOpen ? mapVotes : null,
      /** The Power Map on the canvas, at a map (by id) or whole (null), when a link in the chat opened it. */
      mapAt,
      selected: canvasIsOpen ? petal : null,
      boxOpen,
      petal: selectedPetal && canvasPetal(selectedPetal),
      unit: panelFlower && facts.units[panelFlower.spec.selection.measure],
      /** the selected petal's dollars at its map's price */
      worth:
        selectedPetal && panelFlower
          ? petalWorth(selectedPetal.amount, panelFlower.spec.selection.measure, mapValue)
          : null,
      section,
      thumbs,
      heading:
        open.kind === 'stored'
          ? 'Continue this flower'
          : (panelBus.rows.find((c) => c.current)?.title ??
            elsewherePacket?.question ??
            'Conversation'),
      menuShown: panelBus.shown,
      /** Where the side panel ends now, in pixels. */
      panelEdge: panelBus.edge,
      jobs,
      jobControls,
      balance: funds?.balance ? payWords.balance(funds.balance) : null,
      /** none left to spend: the composer links to the lobby's Balance, where credit is added */
      noCredit,
      session,
      needsWallet,
      composerShown,
      question,
      pill:
        showModel && catalogue && settings
          ? modelPill(catalogue, settings, conversation?.answered ?? null)
          : null,
      models:
        showModel && catalogue && settings
          ? modelOptions(catalogue, settings, funds?.where?.near_usd ?? null)
          : [],
      modelsOpen: showModel && modelsOpen,
      recorded,
    },
    actions: {
      setQuestion: chatActions.setQuestion,
      send: () =>
        chatActions.send(
          questionPrefix(mapAt ? null : panelFlower, target),
          picked ?? undefined,
          undefined,
          front.current ?? undefined,
        ),
      /**
       * A wallet's "Population not mapped", pressed: Petals' agent is asked to map it, about that wallet, and the
       * box steps aside so the conversation shows the ask running (the box covers the thread).
       */
      mapPopulation: () => {
        setBoxOpen(false);
        void chatActions.send(
          questionPrefix(mapAt ? null : panelFlower, target),
          picked ?? undefined,
          populationWords.ask,
          front.current ?? undefined,
        );
      },
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
        setMapAt(null);
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
      /**
       * A click inside a map on the canvas: a petal opens that map's flower here, as a link to it would,
       * with the petal chosen and its box open, so it does what a petal does everywhere.
       */
      pickOnMap: (hit: CanvasHit) => {
        const map = mapAt?.map;
        if (hit.kind !== 'petal' || !map) return;
        void (async () => {
          const href = await readMapDrawing(map);
          const drawing = href ? drawingLink(href, window.location.origin) : null;
          if (!drawing) return;
          if ('stored' in drawing) openStored(drawing.stored);
          else {
            let spec: Spec | null = null;
            if ('sha' in drawing) spec = await readDrawingSpec(drawing.sha);
            else {
              const read = decodeDraft(drawing.draft);
              spec = read.ok ? read.spec : null;
            }
            if (!spec) return;
            openDraft(spec);
          }
          select(hit.id);
        })().catch(() => {});
      },
      closeBox: () => setBoxOpen(false),
      /** A next step pressed: it goes to Petals' agent as the person's words, or only fills the field. */
      step: (s: { ask: string; finish: boolean }) => {
        setNextMore(false);
        if (!s.finish) {
          chatActions.setQuestion(s.ask);
          refs.box.current?.focus();
          return;
        }
        void chatActions.send(undefined, picked ?? undefined, s.ask, front.current ?? undefined);
      },
      toggleNextMore: () => setNextMore((open) => !open),
      setMode,
      /** A new map's ceremony, pressed: Petals' agent hears a plain yes, and its read starts (lib/ceremony.ts). */
      mapIt: () => {
        setMode('mapping');
        void chatActions.send(
          undefined,
          picked ?? undefined,
          ceremonyWords.yes,
          front.current ?? undefined,
        );
      },
      /** the map on the canvas says which wallet is chosen on it, or none */
      chooseMapWallet: setMapWallet,
      /** the surface says what the canvas has open, for the next turn (lib/in-front.ts) */
      inFront: tellFront,
      closeDetail: () => dispatch({ type: 'select', petal: null }),
      setSection: (next: PanelSection) => dispatch({ type: 'section', section: next }),
      startFrom: (text: string) => {
        chatActions.setQuestion(text);
        refs.box.current?.focus();
      },
      /**
       * A link in the conversation to one of this site's flowers opens it here, on the canvas beside it, not
       * outside the work surface: a stored one (/f/), a drawing (/draft?spec=) or a view on the
       * map (/d/<sha>, read first). One that can't be read goes where it points, as any link would. A link to
       * the Power Map (/map) or a map on it (/m/<id>) opens the map here.
       */
      followLink: (href: string) => {
        const map = mapLink(href, window.location.origin);
        if (map) {
          setMapAt(map);
          setBoxOpen(false);
          return true;
        }
        const drawing = drawingLink(href, window.location.origin);
        if (!drawing) return false;
        if ('stored' in drawing) {
          openStored(drawing.stored);
          return true;
        }
        if ('draft' in drawing) {
          const read = decodeDraft(drawing.draft);
          if (!read.ok) return false;
          openDraft(read.spec);
          return true;
        }
        void readDrawingSpec(drawing.sha).then(
          (spec) => (spec ? openDraft(spec) : window.location.assign(href)),
          () => window.location.assign(href),
        );
        return true;
      },
    },
    refs,
  };
}
