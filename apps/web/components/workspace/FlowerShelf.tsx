'use client';
// The panel before there's a flower in it (Figma's "New question" 43:736 and "Reading the record"
// 39:668): what to do here, and maps already made, one per address, each opening its page.
import type { ShelfView } from '../../lib/panel-view.ts';
import { MapList } from '../MapList.tsx';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function FlowerShelf({
  view,
  onStarter,
}: {
  view: ShelfView;
  onStarter?: (question: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-block-gap overflow-y-auto p-column-gap">
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
