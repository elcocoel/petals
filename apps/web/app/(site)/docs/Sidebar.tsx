'use client';

import { useState } from 'react';
import type { DocPage } from '../../../components/docs/content.ts';
import styles from '../../../components/docs/docs.module.css';
import { Button } from '../../../components/ui/Button.tsx';
import { Icon } from '../../../components/ui/Icon.tsx';

export function Sidebar({ pages, current }: { pages: DocPage[]; current: DocPage }) {
  const [open, setOpen] = useState(false);
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
        {pages
          .filter((p) => p.overview)
          .map((section) => (
            <details key={section.slug} open={current.section === section.section}>
              <summary>{section.title}</summary>
              {(['guide', 'reference'] as const).map((kind) => {
                const group = pages.filter((p) => p.section === section.section && p.kind === kind);
                return (
                  group.length > 0 && (
                    <div className={styles.navGroup} key={kind} data-kind={kind}>
                      <p className={styles.navGroupTitle}>
                        <Icon name={kind === 'guide' ? 'petals' : 'project'} small />
                        {kind === 'guide' ? 'Guides' : 'System reference'}
                      </p>
                      {group.map((p) => (
                        <a
                          key={p.slug}
                          href={`/docs/${p.slug}`}
                          aria-current={current.slug === p.slug ? 'page' : undefined}
                        >
                          {p.overview ? 'Overview' : p.title}
                        </a>
                      ))}
                    </div>
                  )
                );
              })}
            </details>
          ))}
      </nav>
    </aside>
  );
}
