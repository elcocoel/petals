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
              <a
                href={`/docs/${section.slug}`}
                aria-current={current.slug === section.slug ? 'page' : undefined}
              >
                Overview
              </a>
              {pages
                .filter((p) => p.section === section.section && !p.overview)
                .map((p) => (
                  <a
                    key={p.slug}
                    href={`/docs/${p.slug}`}
                    aria-current={current.slug === p.slug ? 'page' : undefined}
                  >
                    {p.title}
                  </a>
                ))}
            </details>
          ))}
      </nav>
    </aside>
  );
}
