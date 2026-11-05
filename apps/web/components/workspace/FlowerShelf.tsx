'use client';
// The panel before there's a flower in it (Figma's "New question" 43:736 and "Reading the record"
// 39:668): what to do here, and the flowers already mapped, which open in the panel.
import type { ShelfView } from '../../lib/panel-view.ts';
import { FlowerTile } from '../FlowerTile.tsx';
import { Button } from '../ui/Button.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function FlowerShelf({
  view,
  onOpen,
  onStarter,
}: {
  view: ShelfView;
  onOpen?: (id: string) => void;
  onStarter?: (question: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-block-gap overflow-y-auto p-column-gap">
      {view.pending ? null : <Drawing kind="cell" size="cell-large" />}
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
      {view.tiles.length > 0 && (
        <ul className="flex flex-wrap gap-block-gap">
          {view.tiles.map((t) => (
            <li key={t.id}>
              <FlowerTile
                title={t.title}
                where={t.where}
                badge={t.badge}
                image={t.image}
                onOpen={() => onOpen?.(t.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <div>
        <TextLink variant="quiet" href="/gallery">
          The whole gallery
        </TextLink>
      </div>
    </div>
  );
}
