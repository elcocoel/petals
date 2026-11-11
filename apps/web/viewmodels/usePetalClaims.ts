// What's said about the selected petal's account, and adding a note or a name to it (annotation-layer.md,
// steps 3 and 7). The person's own annotations are read once a petal is selected, and again after one is
// added; a visitor has none, and the server says so, so nothing shows for them. lib/claim-lines.ts holds
// the words.
import { useCallback, useEffect, useState } from 'react';
import { addMyAnnotations, readMyAnnotations } from '../lib/agent-client.ts';
import {
  type AnnotationRow,
  type ClaimLine,
  claimLines,
  claimWords,
  noteDraft,
} from '../lib/claim-lines.ts';

export function usePetalClaims(
  account: string | null,
  /** The conversation it's said in: a run's id or another door's, kept in its project. */
  conversation: string | null,
): {
  /** Someone is signed in, so there's something of theirs to show and a way to add to it. */
  signedIn: boolean;
  lines: ClaimLine[];
  words: string;
  saving: boolean;
  failed: string | null;
  setWords: (w: string) => void;
  save: (as: 'note' | 'name') => void;
} {
  const [rows, setRows] = useState<AnnotationRow[] | null>(null);
  const [reads, setReads] = useState(0);
  const [words, setWords] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reads` is the signal to read again
  useEffect(() => {
    if (!account) return;
    let gone = false;
    void readMyAnnotations().then((r) => {
      if (!gone) setRows(r);
    });
    return () => {
      gone = true;
    };
  }, [account, reads]);
  // another petal: what was typed for the last one doesn't carry over
  const [typedFor, setTypedFor] = useState(account);
  if (account !== typedFor) {
    setTypedFor(account);
    setWords('');
    setFailed(null);
  }

  const save = useCallback(
    async (as: 'note' | 'name') => {
      if (!account || !words.trim() || saving) return;
      setSaving(true);
      setFailed(null);
      try {
        await addMyAnnotations({
          annotations: [noteDraft(account, words, as)],
          ...(conversation ? { conversation } : {}),
        });
        setWords('');
        setReads((n) => n + 1);
      } catch {
        setFailed(claimWords.failed);
      } finally {
        setSaving(false);
      }
    },
    [account, words, saving, conversation],
  );

  return {
    signedIn: rows !== null,
    lines: claimLines(rows ?? [], account),
    words,
    saving,
    failed,
    setWords,
    save: (as) => void save(as),
  };
}
