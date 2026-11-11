'use client';
// What the flower's own box shows: the flower's date, then the selected petal or the reading key, and
// the rest one quiet click away. Before there's a flower, the shelf, or the words for why not. The flower
// itself is the canvas under this, and its title is the box's bar, so neither is here.
import type { PetalDetail } from '@petal/core/types';
import type { ReactNode } from 'react';
import { Interpretation, SignatureLine } from '../components/Interpretation.tsx';
import { Legend, LegendKeys } from '../components/Legend.tsx';
import { PetalClaims } from '../components/PetalClaims.tsx';
import { PetalDetails } from '../components/PetalDetails.tsx';
import { SourceList } from '../components/Sources.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { TextLink } from '../components/ui/TextLink.tsx';
import { FlowerShelf } from '../components/workspace/FlowerShelf.tsx';
import { ReadingKey } from '../components/workspace/ReadingKey.tsx';
import type { FlowerPanelView, PanelView } from '../lib/panel-view.ts';
import type { PanelSection } from '../lib/thread.ts';

export interface FlowerPanelActions {
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
  note,
  about,
  conversation,
}: {
  view: FlowerPanelView;
  petal: PetalDetail | null;
  unit?: string | undefined;
  section: PanelSection;
  actions: FlowerPanelActions;
  note?: ReactNode;
  about?: ReactNode;
  /** The conversation the flower is open in, where a note about a petal is kept. */
  conversation?: string | null;
}) {
  return (
    <div className="flex flex-col gap-text-gap p-block-gap">
      <header className="flex flex-wrap items-center justify-between gap-x-text-gap">
        <p className="type-label whitespace-pre-wrap">
          {view.where}
          {'   /   '}
          {view.date}
        </p>
        {actions.onShelf && (
          <Button variant="quiet" onClick={actions.onShelf}>
            Explore another flower
          </Button>
        )}
      </header>
      {note}
      {view.failed ? (
        <p className="error">The flower could not be drawn: {view.failed}</p>
      ) : view.svg ? null : (
        <div className="flex items-center gap-text-gap type-lead">
          <Icon name="petals" />
          Drawing…
        </div>
      )}
      {view.keys.length > 0 && <LegendKeys keys={view.keys} />}
      {petal ? (
        <>
          <PetalDetails petal={petal} unit={unit} onClose={actions.onCloseDetail} />
          <PetalClaims account={view.account} conversation={conversation ?? null} />
        </>
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
        {view.viewUrl && (
          <TextLink variant="quiet" href={view.viewUrl} target="_blank" rel="noreferrer">
            Open as a page
          </TextLink>
        )}
      </div>
      {section === 'reading' && (
        <div>
          {view.interpretation && (
            <Interpretation reading={view.interpretation} sources={view.sources} />
          )}
          <Legend items={view.legend} sources={view.sources} />
          {view.legendSources.length > 0 && (
            <p className="type-caption">
              <SourceList ids={view.legendSources} urls={view.sources} />
            </p>
          )}
          <SignatureLine signature={view.signature} model={view.model} />
          <p data-quiet className="type-mono wrap-anywhere text-muted">
            {view.checks && `${view.checks}. `}spec_sha256 {view.hashes}
          </p>
          {about}
        </div>
      )}
    </div>
  );
}

export function FlowerPanel({
  view,
  petal = null,
  unit,
  section = null,
  actions = {},
  note,
  about,
  conversation,
}: {
  view: PanelView;
  /** The selected petal's own record, when one is selected. */
  petal?: PetalDetail | null;
  unit?: string | undefined;
  section?: PanelSection;
  actions?: FlowerPanelActions;
  /** what a page says about the flower first, under its date: that it's a draft, or written on NEAR */
  note?: ReactNode;
  /** what a page knows about the flower besides its reading (who made it, who published it), with its sources */
  about?: ReactNode;
  /** The conversation it's open in (a run's id or another door's), where a note about a petal is kept. */
  conversation?: string | null;
}) {
  if (view.kind === 'flower') {
    return (
      <OpenFlower
        view={view}
        petal={petal}
        unit={unit}
        section={section}
        actions={actions}
        note={note}
        about={about}
        conversation={conversation ?? null}
      />
    );
  }
  if (view.kind === 'shelf') {
    return (
      <FlowerShelf view={view} {...(actions.onStarter ? { onStarter: actions.onStarter } : {})} />
    );
  }
  return (
    <div className="p-block-gap">
      <p className={view.kind === 'failed' ? 'error' : 'type-body text-muted'}>{view.text}</p>
      {view.kind === 'failed' && actions.onShelf && (
        <Button variant="link" onClick={actions.onShelf}>
          Explore another flower
        </Button>
      )}
    </div>
  );
}
