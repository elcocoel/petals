// What can be picked instead of the model in the composer's pill. It sits in a FloatBox, and the choices
// come from modelOptions in lib/composer-options.ts. On the app scale, as the conversation is (design/conversation.md).
import type { ModelOption } from '../../lib/composer-options.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';

export function ModelOptions({
  options,
  onPick,
}: {
  options: ModelOption[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-space-8 p-block-gap">
      {options.map((option) => (
        <Button key={option.id} variant="row" pressed={option.on} onClick={() => onPick(option.id)}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="type-ui">{option.label}</span>
            <Mono as="span" tone="muted">
              {option.sub}
            </Mono>
          </span>
        </Button>
      ))}
    </div>
  );
}
