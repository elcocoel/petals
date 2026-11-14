'use client';

// The docs' navigation, and over it the search: the map's box on the docs.
// While something's typed, the pages it finds stand in the sections' place, each with the section that matched and
// the words around the match. Enter asks for the best order; Escape clears it; Cmd+K (Ctrl+K off a Mac) puts the
// cursor in it, opening the navigation on a phone.
import { useEffect, useMemo, useState } from 'react';
import type { DocPage } from '../../../components/docs/content.ts';
import styles from '../../../components/docs/docs.module.css';
import { byDepartment } from '../../../components/docs/groups.ts';
import { Button } from '../../../components/ui/Button.tsx';
import { Field } from '../../../components/ui/Field.tsx';
import { Icon } from '../../../components/ui/Icon.tsx';
import { Mono } from '../../../components/ui/Mono.tsx';
import { searchDocs } from '../../../lib/agent-client.ts';
import {
  DOCS_SEARCH_ID,
  docsRows,
  docsSearchStatus,
  docsSearchWords as words,
} from '../../../lib/docs-search.ts';
import { useMapSearch } from '../../../viewmodels/useMapSearch.ts';

export function Sidebar({ pages, current }: { pages: DocPage[]; current: DocPage }) {
  const [open, setOpen] = useState(false);
  const finding = useMapSearch(searchDocs);
  const typed = finding.q.trim() !== '';
  const rows = useMemo(() => {
    const body = typed ? finding.got?.body : undefined;
    return body ? docsRows(body, pages) : null;
  }, [typed, finding.got, pages]);
  const status = docsSearchStatus(finding.q, finding.busy, finding.got, rows);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setOpen(true);
      setAsked((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (asked) document.getElementById(DOCS_SEARCH_ID)?.focus();
  }, [asked]);
  return (
    <aside className={styles.sidebar}>
      <div className={styles.mobileToggle}>
        <Button variant="quiet" pressed={open} onClick={() => setOpen(!open)}>
          <Icon name="sidebar" small /> {open ? 'Close contents' : 'Browse the docs'}
        </Button>
      </div>
      <nav aria-label="Documentation" className={styles.navigation} data-open={open}>
        <div className={styles.navTitle}>
          <Icon name="project" small /> Documentation
        </div>
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            finding.order();
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || !finding.q) return;
            e.stopPropagation();
            finding.clear();
          }}
        >
          <Field
            id={DOCS_SEARCH_ID}
            label={words.label}
            hideLabel
            placeholder={words.placeholder}
            value={finding.q}
            onChange={finding.type}
            maxLength={200}
          />
        </form>
        {status && (
          <Mono as="p" tone="muted">
            {status}
          </Mono>
        )}
        {typed && rows && rows.length > 0 && (
          <div className={styles.hits}>
            {rows.map((r) => (
              <a key={r.href} href={r.href}>
                <span className={styles.hitTitle}>{r.title}</span>
                {r.heading && <span className={styles.hitHeading}>{r.heading}</span>}
                {r.snippet.length > 0 && (
                  <span className={styles.hitSnippet}>
                    {r.snippet.map((piece) =>
                      piece.hit ? (
                        <strong key={piece.at}>{piece.text}</strong>
                      ) : (
                        <span key={piece.at}>{piece.text}</span>
                      ),
                    )}
                  </span>
                )}
                <Mono as="span" tone="muted">
                  {r.section}
                </Mono>
              </a>
            ))}
          </div>
        )}
        {!typed &&
          pages
            .filter((p) => p.overview)
            .map((section) => (
              <details key={section.slug} open>
                <summary>{section.title}</summary>
                {(['guide', 'reference'] as const).flatMap((kind) =>
                  byDepartment(
                    pages.filter((p) => p.section === section.section && p.kind === kind),
                  ).map((group) => (
                    <div
                      className={styles.navGroup}
                      key={`${kind}:${group.department ?? ''}`}
                      data-kind={kind}
                    >
                      {(kind === 'reference' || group.title) && (
                        <p className={styles.navGroupTitle}>
                          {kind === 'reference' && <Icon name="project" small />}
                          {group.title ?? 'System reference'}
                        </p>
                      )}
                      {group.pages.map((p) => (
                        <a
                          key={p.slug}
                          href={`/docs/${p.slug}`}
                          aria-current={current.slug === p.slug ? 'page' : undefined}
                        >
                          {p.overview || p.hub ? 'Overview' : p.title}
                        </a>
                      ))}
                    </div>
                  )),
                )}
              </details>
            ))}
      </nav>
    </aside>
  );
}
