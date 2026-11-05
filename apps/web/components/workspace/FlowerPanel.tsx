'use client';
// The panel beside the conversation (Figma's "One petal" 39:862 and "Open featured flower" 42:893): the
// flower's title and date, the flower on its stage, the legend, then the selected petal or the reading
// key. Interpretation, sources, publish and quote stay one quiet click away.
import type { PetalDetail } from '@petal/core/types';
import type { FlowerPanelView, PanelView } from '../../lib/panel-view.ts';
import type { PanelSection } from '../../lib/thread.ts';
import { Stage } from '../canvas/Stage.tsx';
import { StagedFlower } from '../canvas/StagedFlower.tsx';
import { Interpretation, SignatureLine } from '../Interpretation.tsx';
import { Legend, LegendKeys } from '../Legend.tsx';
import { PetalDetails } from '../PetalDetails.tsx';
import { QuotePanel } from '../QuotePanel.tsx';
import { Button } from '../ui/Button.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { TextLink } from '../ui/TextLink.tsx';
import { FlowerShelf } from './FlowerShelf.tsx';
import { ReadingKey } from './ReadingKey.tsx';

export interface FlowerPanelActions {
  onSelect?: (petal: string | null) => void;
  onCloseDetail?: () => void;
  onSection?: (section: PanelSection) => void;
  onShelf?: () => void;
  onOpenStored?: (id: string) => void;
  onStarter?: (question: string) => void;
}

function OpenFlower({
  view,
  petal,
  unit,
  section,
  actions,
}: {
  view: FlowerPanelView;
  petal: PetalDetail | null;
  unit?: string | undefined;
  section: PanelSection;
  actions: FlowerPanelActions;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-text-gap px-column-gap pt-column-gap pb-text-gap">
      <header className="flex items-start justify-between gap-text-gap">
        <div className="flex min-w-0 flex-col gap-space-8">
          <h1 className="m-0 type-title">{view.title}</h1>
          <p className="type-label whitespace-pre-wrap">
            {view.where}
            {'   /   '}
            {view.date}
          </p>
        </div>
        <div className="shrink-0">
          <Button variant="quiet" onClick={actions.onShelf}>
            Explore another flower
          </Button>
        </div>
      </header>
      {view.failed ? (
        <p className="error">The flower could not be drawn: {view.failed}</p>
      ) : view.svg ? (
        <Stage
          label={`The flower: ${view.title}`}
          fitKey={view.key}
          pickAttribute="data-p"
          bleed
          {...(actions.onSelect ? { onPick: actions.onSelect } : {})}
        >
          <StagedFlower svg={view.svg} selected={view.selected} />
        </Stage>
      ) : (
        <div className="flex min-h-stage-height flex-1 items-center gap-text-gap type-lead">
          <Drawing kind="cell" size="cell-medium" />
          Drawing…
        </div>
      )}
      <LegendKeys keys={view.keys} />
      <div className="flex max-h-1/2 shrink-0 flex-col gap-text-gap overflow-y-auto border-t border-hairline pt-text-gap">
        {petal ? (
          <PetalDetails petal={petal} unit={unit} onClose={actions.onCloseDetail} />
        ) : (
          <ReadingKey view={view.reading} />
        )}
        <div className="flex flex-wrap items-center gap-x-block-gap">
          <Button
            variant="quiet"
            pressed={section === 'reading'}
            onClick={() => actions.onSection?.('reading')}
          >
            Interpretation and sources
          </Button>
          {view.publishUrl && (
            <TextLink variant="quiet" href={view.publishUrl}>
              Publish on NEAR
            </TextLink>
          )}
          <Button
            variant="quiet"
            pressed={section === 'quote'}
            onClick={() => actions.onSection?.('quote')}
          >
            Sponsor a refresh
          </Button>
          {view.viewUrl && (
            <TextLink variant="quiet" href={view.viewUrl} target="_blank" rel="noreferrer">
              Open as a page
            </TextLink>
          )}
        </div>
        {section === 'reading' && (
          <div>
            <Interpretation reading={view.interpretation} sources={view.sources} />
            <Legend items={view.legend} sources={view.sources} />
            <SignatureLine signature={view.signature} model={view.model} />
            <p data-quiet className="type-mono wrap-anywhere text-muted">
              {view.checks}. spec_sha256 {view.hashes}
            </p>
          </div>
        )}
        {section === 'quote' && <QuotePanel purpose="sponsor_refresh" network={view.network} />}
      </div>
    </div>
  );
}

export function FlowerPanel({
  view,
  petal = null,
  unit,
  section = null,
  actions = {},
}: {
  view: PanelView;
  /** The selected petal's own record, when one is selected. */
  petal?: PetalDetail | null;
  unit?: string | undefined;
  section?: PanelSection;
  actions?: FlowerPanelActions;
}) {
  return (
    <section
      aria-label="Flower"
      className="flex min-h-0 min-w-0 flex-1 flex-col wide:basis-panel-width"
    >
      {view.kind === 'flower' ? (
        <OpenFlower view={view} petal={petal} unit={unit} section={section} actions={actions} />
      ) : view.kind === 'shelf' ? (
        <FlowerShelf
          view={view}
          {...(actions.onOpenStored ? { onOpen: actions.onOpenStored } : {})}
          {...(actions.onStarter ? { onStarter: actions.onStarter } : {})}
        />
      ) : (
        <div className="p-column-gap">
          <p className={view.kind === 'failed' ? 'error' : 'type-body text-muted'}>{view.text}</p>
          {view.kind === 'failed' && (
            <Button variant="link" onClick={actions.onShelf}>
              Explore another flower
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
