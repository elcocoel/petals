'use client';
// The panel before there's a flower in it (Figma's "New question" 43:736 and "Reading the record"
// 39:668): what to do here, and maps already made, one per address, each opening its page. Where the page
// can open a map in place (/make's canvas, #78), `onLink` has its links first, as the conversation's do.
import type { MouseEvent } from 'react';
import type { ShelfView } from '../../lib/panel-view.ts';
import { MapList } from '../MapList.tsx';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function FlowerShelf({
  view,
  onStarter,
  onLink,
}: {
  view: ShelfView;
  onStarter?: (question: string) => void;
  /** a link's address, before it goes: true when the page opened it in place */
  onLink?: (href: string) => boolean;
}) {
  const inPlace = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest('a');
    const href = a?.getAttribute('href');
    if (!onLink || !href || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (onLink(href)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  return (
    // it only hands its links' clicks to the page; a link's Enter is a click, so it arrives here too
    <div
      className="flex min-h-0 flex-1 flex-col gap-block-gap overflow-y-auto p-column-gap"
      onClickCapture={inPlace}
    >
      {view.pending ? null : <Icon name="petals" />}
      <div className="flex flex-col gap-text-gap">
        <h2 className={`m-0 ${view.pending ? 'type-heading' : 'type-title'}`}>{view.heading}</h2>
        <p className="type-body">{view.note}</p>
        {view.starter && (
          <div>
            <Button variant="link" onClick={() => onStarter?.(view.starter?.question ?? '')}>
              {view.starter.label}
            </Button>
          </div>
        )}
      </div>
      {view.tiles.length > 0 && <MapList label={view.heading} rows={view.tiles} />}
      <div>
        <TextLink variant="quiet" href="/map">
          The whole Power Map
        </TextLink>
      </div>
    </div>
  );
}
