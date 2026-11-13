// Where credit is added: the lobby's Balance, opened at Add. The conversation and the composer only point
// there, with one plain link in the words around it, so it takes their type. Words from lib/pay.ts.
import { ADD_CREDIT_HREF, payWords } from '../../lib/pay.ts';

export function CreditPointer({ line }: { line?: string }) {
  return (
    <span>
      {line && `${line} `}
      <a href={ADD_CREDIT_HREF}>{payWords.addCredit}</a>
    </span>
  );
}
