// Where credit is added: the lobby's Balance, opened at Add. The conversation and the composer only point
// there, with one link, and an optional line before it. Words from lib/pay.ts.
import { ADD_CREDIT_HREF, payWords } from '../../lib/pay.ts';
import { Button } from '../ui/Button.tsx';

export function CreditPointer({ line }: { line?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-space-8">
      {line && <span className="type-ui">{line}</span>}
      <Button variant="link" href={ADD_CREDIT_HREF}>
        {payWords.addCredit}
      </Button>
    </span>
  );
}
