'use client';
// The landing's copy editor (Elco, 12 Nov: "write straight on the page with json", after the elementarycomplexity
// site's). Only on a local server, and only with ?edit=1 in the address. "Edit words" makes every piece of the
// page whose words come from lib/landing-copy.ts editable where it stands, found by its words, so no component
// has to know; "Save" sends what changed to app/edit/landing-copy/route.ts, which keeps it in
// lib/landing-copy.edits.json, and the page reloads with it. Words that appear in more than one place (a
// "Connect") change in each. A headline written on several lines is edited a line at a time.
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { copyLeaves } from '../../lib/copy-edits.ts';
import { landingCopy } from '../../lib/landing-copy.ts';

/** Where a piece of the page's words sits in the copy: a field, and which of its lines (-1, the whole). */
type Spot = { path: string; line: number };

const MARK = ['outline-dashed', 'outline-1', 'outline-offset-2', 'outline-accent'];

function spotsByWords(): Map<string, Spot[]> {
  const spots = new Map<string, Spot[]>();
  const add = (words: string, spot: Spot) => {
    const w = words.trim();
    if (w) spots.set(w, [...(spots.get(w) ?? []), spot]);
  };
  for (const [path, words] of copyLeaves(landingCopy)) {
    add(words, { path, line: -1 });
    const lines = words.split('\n');
    if (lines.length > 1) for (const [i, line] of lines.entries()) add(line, { path, line: i });
  }
  return spots;
}

export function CopyEditor() {
  const [on, setOn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const found = useRef(new Map<HTMLElement, { words: string; spots: Spot[] }>());

  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get('edit') === '1');
  }, []);

  useEffect(() => {
    if (!editing) return;
    const spots = spotsByWords();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const node of nodes) {
      const words = node.nodeValue?.trim() ?? '';
      const at = spots.get(words);
      const parent = node.parentElement;
      if (!at || !parent || parent.closest('[data-copy-editor], script, style, svg')) continue;
      let el = parent;
      if (parent.textContent?.trim() !== words) {
        el = document.createElement('span');
        parent.replaceChild(el, node);
        el.appendChild(node);
      }
      el.contentEditable = 'plaintext-only';
      el.classList.add(...MARK);
      found.current.set(el, { words, spots: at });
    }
    // A press on a word edits it: it doesn't follow a link, open a question or open the wallet.
    const hold = (e: Event) => {
      const t = e.target as Element | null;
      if (t?.closest?.('[contenteditable="plaintext-only"]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // One line each: Enter ends the edit.
    const enter = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.target as Element | null)?.closest?.('[contenteditable]')) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    };
    window.addEventListener('click', hold, true);
    window.addEventListener('keydown', enter, true);
    setNote(`${found.current.size} pieces of words can be edited.`);
    return () => {
      window.removeEventListener('click', hold, true);
      window.removeEventListener('keydown', enter, true);
    };
  }, [editing]);

  async function save() {
    const fields = new Map(copyLeaves(landingCopy));
    const edits: Record<string, string> = {};
    for (const [el, { words, spots }] of found.current) {
      const now = (el.textContent ?? '').trim();
      if (now === words) continue;
      for (const { path, line } of spots) {
        const was = edits[path] ?? fields.get(path) ?? '';
        if (line < 0) edits[path] = now;
        else {
          const lines = was.split('\n');
          lines[line] = now;
          edits[path] = lines.join('\n');
        }
      }
    }
    if (Object.keys(edits).length === 0) {
      setNote('Nothing changed.');
      return;
    }
    const res = await fetch('/edit/landing-copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edits }),
    });
    if (!res.ok) {
      setNote(`Not saved: ${await res.text()}`);
      return;
    }
    setNote('Saved.');
    window.location.reload();
  }

  if (!on) return null;
  return (
    <div
      data-copy-editor=""
      className="fixed right-space-16 bottom-space-16 z-10 flex items-center gap-text-gap border border-hairline bg-surface p-text-gap"
    >
      {note && <span className="type-caption">{note}</span>}
      {editing ? (
        <Button variant="compact" onClick={() => void save()}>
          Save
        </Button>
      ) : (
        <Button variant="compact" onClick={() => setEditing(true)}>
          Edit words
        </Button>
      )}
    </div>
  );
}
