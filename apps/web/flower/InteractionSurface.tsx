'use client';
// The page where people work (design/interaction-surface.md): the live flower fills the window, and the
// conversation floats above it, one box a hand can move and size: its thread a light sheet rising out of the
// dark base its input is (design/conversation.md). Another, the same box, shows the flower's own details
// once something asks for them. This only wires the ViewModels to the views. The canvas starts at the side
// panel's edge, and the camera fits the flower beside the conversation, not under it (#78, 11 Nov). Until
// the conversation has a flower, and when a link in it opens a map, the Power Map stands beside the
// conversation, the same live map as /map (#78), with no flower of the conversation's hard-coded in.
import type { SurfaceName } from '@petal/tokens';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Composer } from '../components/chat/Composer.tsx';
import { ConnectWallet } from '../components/chat/ConnectWallet.tsx';
import { ConversationThread } from '../components/chat/ConversationThread.tsx';
import { ModelOptions } from '../components/chat/ModelOptions.tsx';
import { useFollowScroll } from '../components/chat/useFollowScroll.ts';
import { Button } from '../components/ui/Button.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { MappingBox } from '../components/workspace/MappingBox.tsx';
import { LandscapeCanvas } from '../landscape/LandscapeCanvas.tsx';
import { ceremonyWords } from '../lib/ceremony.ts';
import type { Catalogue } from '../lib/composer-options.ts';
import {
  besideOrBelow,
  besidePanel,
  clearOfConversation,
  conversationBoxes,
  overThread,
  recordedBoxes,
  type Size,
} from '../lib/float-box.ts';
import { networkLabel } from '../lib/flower-view.ts';
import { mappingView, modeWords } from '../lib/mapping.ts';
import type { MapCard } from '../lib/maps.ts';
import { groundWords } from '../lib/opening.ts';
import type { Opened } from '../lib/thread.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useGroundMap } from '../viewmodels/useGroundMap.ts';
import { useLegendEdit } from '../viewmodels/useLegendEdit.ts';
import { usePublishPress } from '../viewmodels/usePublishPress.ts';
import { useWorkspace } from '../viewmodels/useWorkspace.ts';
import type { Clear } from './camera.ts';
import { FlowerCanvas } from './FlowerCanvas.tsx';
import { FlowerPanel } from './FlowerPanel.tsx';

const BOXES = ['conversation', 'panel', 'options', 'mapping'] as const;

export function InteractionSurface({
  scatter,
  probe,
  surface,
  ...workspace
}: {
  scatter: boolean;
  probe: boolean;
  surface: SurfaceName;
  initialRun?: string | undefined;
  /** The conversation this page follows, from the address (`?elsewhere=`). */
  initialElsewhere?: string | undefined;
  catalogue?: Catalogue | null;
  initialQuestion: string | null;
  recorded: boolean;
  opening: string;
  shelf: MapCard[];
  initialOpen: Opened;
  initialPetal: string | null;
}) {
  const { state, actions, refs } = useWorkspace(workspace);
  useFollowScroll(refs.thread, refs.following);
  // The boxes start past the side panel when it's there (the layout's, app/(work)/WorkPanel.tsx), and follow
  // its edge when it's sized or folded, until a hand moves them (design/side-panel.md, line 21).
  const edge = state.menuShown ? state.panelEdge : 0;
  const from = state.menuShown ? besidePanel(state.panelEdge) : undefined;
  // The flower's box opens over the thread, not over the flower (lib/float-box.ts overThread).
  const place = useMemo(
    () => (win: Size) => {
      const placed = workspace.recorded
        ? recordedBoxes(win, from)
        : conversationBoxes(win, undefined, from);
      // below the flower when there's no room beside it, as on a phone
      const conversation = besideOrBelow(placed.conversation, win, edge);
      // the mapping state's box waits where the flower's used to, at the top right, clear of the conversation
      return { ...placed, conversation, panel: overThread(conversation), mapping: placed.panel };
    },
    [from, edge, workspace.recorded],
  );
  // the boxes next to the side panel, or near it, move with it as it opens and closes (Elco's walk 5)
  const hands = useFloatBoxes(BOXES, place, { edge, snap: true });
  // What the conversation covers of the canvas, where it starts, so the flower is drawn beside it.
  const area = useRef<HTMLDivElement>(null);
  const [clear, setClear] = useState<Clear | undefined>(undefined);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const win = { w: window.innerWidth, h: window.innerHeight };
      const r = el.getBoundingClientRect();
      setClear(
        clearOfConversation(place(win).conversation, {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
        }),
      );
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [place]);
  const raisePanel = hands.panel.raise;
  useEffect(() => {
    if (state.boxOpen) raisePanel();
  }, [state.boxOpen, raisePanel]);
  // the mapping state's box comes to the top when the person moves into it
  const raiseMapping = hands.mapping.raise;
  useEffect(() => {
    if (state.mode === 'mapping') raiseMapping();
  }, [state.mode, raiseMapping]);
  const raiseOptions = hands.options.raise;
  useEffect(() => {
    if (state.modelsOpen) raiseOptions();
  }, [state.modelsOpen, raiseOptions]);
  const { onCanvas, panel } = state;
  // The Power Map: at the map a link opened, or whole until the conversation has a flower.
  const { land, opening: mapOpening } = useGroundMap();
  // the legend changes the person's view here, with Settings' own hands (#92)
  const legend = useLegendEdit();
  // The Power Map is always the ground (Elco, 12 Nov: "the power map should always be there"): the
  // conversation floats over it, and its flower, where the map holds it, opens the map there instead of
  // replacing it. Only a flower the map doesn't hold yet is drawn apart, until it lands on the map (LOOK's
  // placeholder and new layer, next); never an empty ground while one is on its way.
  const flowerOnMap =
    onCanvas && land && state.flowerSnapshot
      ? land.flowers.findIndex((f) => f.snapshot === state.flowerSnapshot)
      : -1;
  // A new map being made (lib/ceremony.ts): a placeholder on its chain's map, or the map it adds to, a strip under
  // it while the read runs, and its flower landing there (LOOK's placeholder, progress and landed).
  const made = state.making;
  const madeChain =
    made?.held.chain && land
      ? (land.chains.find(
          (c) =>
            c.chain === made.held.chain || c.label.toLowerCase() === made.held.chain?.toLowerCase(),
        )?.chain ?? null)
      : null;
  const madeName = made
    ? (made.held.name ?? made.held.what ?? networkLabel(made.held.network))
    : '';
  const madeReading = made?.flower ? state.drawings[made.flower.spec_sha256]?.reading : undefined;
  const landed =
    made && madeChain && madeReading
      ? {
          chain: madeChain,
          name: madeName,
          reading: madeReading,
          map: made.held.existing_map ?? null,
          snapshot: made.flower?.spec.snapshot.sha256,
        }
      : null;
  const placeholder =
    made && madeChain && !made.flower && !made.held.existing_map
      ? { chain: madeChain, name: madeName }
      : null;
  const progress =
    made && !made.flower && (madeChain || made.held.existing_map)
      ? {
          map: made.held.existing_map ?? ('new' as const),
          words: made.doing ?? ceremonyWords.reading,
          share: null,
        }
      : null;
  const ground = state.mapAt ?? (onCanvas && flowerOnMap < 0 && !landed ? null : { map: null });
  // the open wallet has no map of its own on the Power Map (Elco, walk 5: "population not mapped")
  const unmapped =
    panel.kind === 'flower' &&
    panel.account !== null &&
    land !== null &&
    !land.flowers.some((f) => f.map === panel.account);
  const focus =
    ground?.map && land ? land.flowers.findIndex((f) => f.map === ground.map) : flowerOnMap;
  // the map opens at the conversation's flower: a petal pressed in it is that flower's, as on the flower itself
  const atFlower = !state.mapAt && flowerOnMap >= 0;
  // what the map shows: the map a new read adds to, else what the last answer is about (SYSTEMS's show), else the
  // conversation's flower where the map holds it; undefined says nothing (Elco, 12 Nov: "an answer moves the map")
  const flowerMap = atFlower && land ? (land.flowers[flowerOnMap]?.map ?? null) : null;
  // what the person kept about the map in front of them, published with one press (Elco, 12 Nov)
  // the map in front: the flower the person is inside on the map, else the conversation's (lib/mapping.ts)
  const [inMap, setInMap] = useState<string | null>(null);
  const publishMap = inMap ?? flowerMap ?? state.mapAt?.map ?? made?.held.existing_map ?? null;
  const publishing = usePublishPress(publishMap);
  const mapping = mappingView(
    publishMap,
    (publishMap && land?.flowers.find((f) => f.map === publishMap)?.name) || null,
    publishing.data,
  );
  const show = made?.held.existing_map
    ? { map: made.held.existing_map }
    : (state.mapShow ?? (flowerMap ? { map: flowerMap } : undefined));
  // where it starts is measured (what the conversation covers), so it's painted as the boxes are
  const mapArea = useRef<HTMLDivElement>(null);
  const shown = Boolean(ground && (land || mapOpening));
  useLayoutEffect(() => {
    if (!shown || !mapArea.current) return;
    mapArea.current.style.left = `${clear?.left ?? 0}px`;
    mapArea.current.style.bottom = `${clear?.bottom ?? 0}px`;
  }, [shown, clear?.left, clear?.bottom]);
  return (
    <>
      {/* A new flower is a new scene. Anything else, a whole turn included, leaves the camera alone. */}
      <div ref={area} className="relative h-dvh">
        {ground && (land || mapOpening) ? (
          // beside the conversation, as the flower is, so its chains and its flowers aren't under it
          <div ref={mapArea} className="absolute inset-0">
            {!land ? (
              <p
                role="status"
                className="flex h-full items-center justify-center gap-text-gap type-ui text-muted"
              >
                <Icon name="petals" />
                {groundWords.opening}
              </p>
            ) : (
              <LandscapeCanvas
                key={ground.map ?? (atFlower ? `flower:${focus}` : 'whole')}
                data={land}
                fill="area"
                title="Power Map"
                focus={focus}
                selected={atFlower ? state.selected : null}
                show={show}
                placeholder={placeholder}
                progress={progress}
                landed={landed}
                // inside the conversation's flower a petal is chosen as on the flower; inside a map a link
                // opened, it opens that map's flower here (useWorkspace pickOnMap)
                onPick={atFlower ? actions.pick : actions.pickOnMap}
                // a wallet chosen on it is what the next question is about (Elco, 12 Nov)
                onWallet={actions.chooseMapWallet}
                // the map in front, for the mapping state: the flower the person is inside
                onEnter={setInMap}
                // the room beside the conversation is narrow: the map keeps clear of its own chains
                clearOfChains
                legend={legend}
                // the map's boxes keep the side panel's room rule, as the conversation's do
                panelEdge={edge}
              />
            )}
          </div>
        ) : (
          <FlowerCanvas
            key={onCanvas?.key ?? 'ground'}
            fill="area"
            reading={onCanvas?.reading ?? null}
            votes={state.votes}
            scatter={scatter}
            probe={probe}
            selected={state.selected}
            onPick={actions.pick}
            clear={clear}
          />
        )}
      </div>
      <FloatBox
        label={state.heading}
        title={state.heading}
        surface={surface}
        hand={hands.conversation}
        // Work from another door goes on in its own app: its thread says so, and there's no base to send
        // from (design/conversation.md, line 18).
        foot={
          state.composer.away ? undefined : (
            <>
              {state.needsWallet && (
                <ConnectWallet
                  question={state.question}
                  busy={state.session.busy}
                  failed={state.session.failed}
                  onConnect={state.session.connect}
                />
              )}
              {/* Hidden, not gone, so what's in it and the way to it stay while someone connects. */}
              <div hidden={!state.composerShown} className="flex min-h-0 flex-1 flex-col">
                <Composer
                  view={state.composer}
                  boxRef={refs.box}
                  device
                  className="px-block-gap py-space-16"
                  controls={
                    (state.pill || state.balance) && (
                      <span className="flex flex-wrap items-center gap-space-8">
                        {state.pill && (
                          <Button
                            variant="pill"
                            pressed={state.modelsOpen}
                            onClick={actions.toggleModels}
                          >
                            {state.pill}
                          </Button>
                        )}
                        {state.balance && (
                          <span className="type-mono text-muted">{state.balance}</span>
                        )}
                      </span>
                    )
                  }
                  onChange={actions.setQuestion}
                  onSend={() => void actions.send()}
                  onMode={actions.setMode}
                />
              </div>
            </>
          )
        }
      >
        {/* Petals' greeting and the thread. */}
        <ConversationThread
          recorded={state.recorded}
          rows={state.rows}
          thumbs={state.thumbs}
          threadRef={refs.thread}
          className="px-block-gap pt-space-16 overscroll-none"
          openWord=""
          onOpenTurn={actions.openTurn}
          onOpenStored={actions.openStored}
          onRefollow={actions.refollow}
          onLink={actions.followLink}
          pay={{ ...state.pay, onPay: actions.pay }}
          jobs={state.jobs}
          jobControls={state.jobControls}
          onMapIt={actions.mapIt}
          next={{ onStep: actions.step, moreOpen: state.nextMore, onMore: actions.toggleNextMore }}
        />
      </FloatBox>
      {/* the mapping state: what the person would add to the map in front, in their name (Elco, 12 Nov) */}
      <FloatBox
        label="Mapping"
        title={mapping.heading}
        surface={surface}
        hand={hands.mapping}
        closed={state.mode !== 'mapping'}
        control={
          <Button variant="link" onClick={() => actions.setMode('exploring')}>
            {modeWords.exploring}
          </Button>
        }
      >
        {state.mode === 'mapping' && (
          <MappingBox
            view={mapping}
            press={publishing.view}
            onPublish={() => void publishing.publish()}
          />
        )}
      </FloatBox>
      <FloatBox
        label="Model"
        title="Model"
        surface={surface}
        hand={hands.options}
        closed={!state.modelsOpen}
      >
        <ModelOptions options={state.models} onPick={actions.pickModel} />
      </FloatBox>
      {/* Who's signed in, and the way out, are the side panel's Profile section (PANEL, WORKSPACE, 10 Nov). */}
      <FloatBox
        label="Flower"
        title={panel.kind === 'flower' ? panel.title : undefined}
        surface={surface}
        hand={hands.panel}
        // it opens over the conversation's thread (overThread), so its glass sits on a solid surface: the
        // thread's words and buttons never show through it (WORKSPACE's walk, META's go, 11 Nov)
        solid
        closed={!state.boxOpen}
        control={
          // closes the box; the petal's own way back is in it (PetalDetails)
          <Button variant="link" onClick={actions.closeBox}>
            Close
          </Button>
        }
      >
        {state.boxOpen && (
          <FlowerPanel
            view={panel}
            petal={state.petal}
            unit={state.unit || undefined}
            worth={state.worth}
            section={state.section}
            actions={{
              onCloseDetail: actions.closeDetail,
              onSection: actions.setSection,
              onShelf: actions.showShelf,
              onOpenStored: actions.openStored,
              onStarter: actions.startFrom,
              onLink: actions.followLink,
              onMapPopulation:
                unmapped && !state.busy && !state.composer.away && !workspace.recorded
                  ? actions.mapPopulation
                  : undefined,
            }}
            conversation={state.conversationRef}
          />
        )}
      </FloatBox>
    </>
  );
}
