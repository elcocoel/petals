// One registry entry: its names and source, then each state on each surface it matters on.
import { Eyebrow } from '../components/ui/Eyebrow.tsx';
import { Surface } from '../components/ui/Surface.tsx';
import type { LabEntry, LabState } from './registry.tsx';

function StateView({ state }: { state: LabState }) {
  return (
    <div className={`flex flex-col items-start gap-text-gap ${state.wide ? 'w-full' : ''}`}>
      <Eyebrow>
        {state.name}
        {state.figmaNode ? ` · ${state.figmaName} ${state.figmaNode}` : ''}
      </Eyebrow>
      {state.render()}
    </div>
  );
}

export function LabEntryView({ entry }: { entry: LabEntry }) {
  return (
    <article id={entry.id.toLowerCase()} className="flex flex-col gap-text-gap">
      <h3>{entry.id}</h3>
      <p className="type-mono-small text-muted">
        {entry.figmaNode
          ? `${entry.figmaName} ${entry.figmaNode}`
          : entry.states.some((s) => s.figmaNode)
            ? 'In Figma, state by state'
            : 'Not in Figma yet'}{' '}
        · {entry.source}
      </p>
      {(entry.surfaces ?? ['ground']).map((kind) => (
        <Surface
          key={kind}
          kind={kind}
          className="flex flex-wrap items-start gap-block-gap overflow-x-auto border border-hairline p-block-gap"
        >
          {entry.states.map((state) => (
            <StateView key={state.name} state={state} />
          ))}
        </Surface>
      ))}
    </article>
  );
}
