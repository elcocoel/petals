// The mapping state's box on /make (lib/mapping.ts): the map in front, what the person would add to it in their
// name, layer by layer (what can't go yet saying why), every item, and the publish press. Props only.
import type { MappingView } from '../../lib/mapping.ts';
import type { PublishPressView } from '../../lib/publish-press.ts';
import { PublishPress } from '../PublishPress.tsx';

export function MappingBox({
  view,
  press,
  onPublish,
}: {
  view: MappingView;
  press: PublishPressView | null;
  onPublish: () => void;
}) {
  return (
    <div className="flex flex-col gap-text-gap p-block-gap">
      <p className="m-0 type-label">{view.intro}</p>
      {view.adds.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-space-4 p-0">
          {view.adds.map((a) => (
            <li key={a.key} className="flex flex-col">
              <span className={a.goes ? 'type-ui' : 'type-ui text-muted'}>{a.line}</span>
              {a.why && <span className="type-caption text-muted">{a.why}</span>}
            </li>
          ))}
        </ul>
      )}
      {view.empty && <p className="m-0 type-ui text-muted">{view.empty}</p>}
      {press && <PublishPress view={press} onPublish={onPublish} />}
    </div>
  );
}
