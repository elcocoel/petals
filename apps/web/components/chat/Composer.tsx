// The box at the bottom of the conversation. It's the one AskBox; the words and decisions come from
// composerView in lib/thread-view.ts. On /make it's the conversation's dark base (`device`), which it fills.
import type { ReactNode, Ref } from 'react';
import type { ComposerView } from '../../lib/thread-view.ts';
import { AskBox } from '../ui/AskBox.tsx';
import { Button } from '../ui/Button.tsx';

export function Composer({
  view,
  boxRef,
  controls,
  className = 'pt-text-gap pr-space-32 pb-space-32 pl-column-gap',
  device = false,
  onChange,
  onSend,
  onMode,
}: {
  view: ComposerView;
  boxRef?: Ref<HTMLTextAreaElement>;
  /** The conversation's settings, under the field. */
  controls?: ReactNode;
  /** Where it sits in whatever holds it. By default, at the foot of the conversation's column. */
  className?: string;
  /** The field fills the base it's in (design/conversation.md, line 15). */
  device?: boolean;
  onChange: (text: string) => void;
  onSend: () => void;
  /** the person moves between exploring and mapping */
  onMode?: (mode: 'exploring' | 'mapping') => void;
}) {
  return (
    <div
      className={`flex flex-col gap-space-8 ${device ? 'min-h-0 flex-1' : 'shrink-0'} ${className}`}
    >
      {view.modes && onMode && (
        <div className="flex items-center gap-space-8">
          {(['exploring', 'mapping'] as const).map((m) => (
            // the state the person is in is filled, as Send is; the other one a press away
            <Button
              key={m}
              variant={view.modes?.now === m ? 'compact' : 'pill'}
              pressed={view.modes?.now === m}
              onClick={() => onMode(m)}
            >
              {view.modes?.[m]}
            </Button>
          ))}
        </div>
      )}
      {view.state && (
        <p data-quiet className="type-mono text-muted">
          {view.state}
        </p>
      )}
      {view.about && (
        <p data-quiet className="type-mono text-muted">
          {view.about}
        </p>
      )}
      <AskBox
        size={device ? 'device' : 'composer'}
        id="q"
        label={view.label}
        placeholder={view.placeholder}
        action={view.button}
        value={view.value}
        readOnly={view.readOnly}
        disabled={view.away}
        canAsk={!view.disabled}
        controls={controls}
        boxRef={boxRef}
        onChange={(e) => onChange(e.target.value)}
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      />
      {view.run && <p className="type-mono text-muted">You can leave and come back.</p>}
    </div>
  );
}
