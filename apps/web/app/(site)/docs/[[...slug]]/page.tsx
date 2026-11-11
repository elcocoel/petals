import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalog, content, editUrl } from '../../../../components/docs/content.ts';
import styles from '../../../../components/docs/docs.module.css';
import { Button } from '../../../../components/ui/Button.tsx';
import { Icon } from '../../../../components/ui/Icon.tsx';
import { Sidebar } from '../Sidebar.tsx';

// All source reads happen at build time; no filesystem or source tracing is needed on the host.
export const dynamic = 'force-static';
export const dynamicParams = false;
type Props = { params: Promise<{ slug?: string[] }> };
export function generateStaticParams() {
  return [{ slug: [] }, ...catalog().map((p) => ({ slug: p.slug.split('/') }))];
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug?.join('/') || 'getting-started';
  const page = catalog().find((p) => p.slug === slug);
  return {
    title: `${page?.title ?? 'Documentation'} · Petals`,
    description: 'The Petals brain, data, rendering and API, from their source files.',
    alternates: { canonical: `/docs/${slug}` },
  };
}
export default async function Docs({ params }: Props) {
  const slug = (await params).slug?.join('/') || 'getting-started';
  const pages = catalog();
  const index = pages.findIndex((p) => p.slug === slug);
  const page = pages[index];
  if (!page) notFound();
  const document = await content(page, pages);
  const section = pages.find((p) => p.section === page.section && p.overview);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  return (
    <div className={`${styles.shell} type-ui`}>
      <div className={styles.skip}>
        <a href="#doc-content">Skip to the document</a>
      </div>
      <Sidebar pages={pages} current={page} />
      <article id="doc-content" className={styles.article}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            <a href="/docs">Docs</a>
            <Icon name="chevron" small />
            <span>{section?.title}</span>
          </div>
          <h1 className="type-lead">{page.title}</h1>
          <div className={styles.source}>
            <Icon name="project" small />
            <code>{page.source}</code>
          </div>
          {page.status && <p className={styles.status}>Brain status: {page.status}</p>}
          {page.draft && (
            <p className={styles.draft}>Draft introduction — waiting for Elco's words.</p>
          )}
          {page.source.startsWith('specs/') && (
            <p className={styles.draft}>
              Source contract. Dated notes and future phases retain their original status.
            </p>
          )}
        </header>
        {document.headings.length > 0 && (
          <details className={styles.mobileContents}>
            <summary>On this page</summary>
            <Contents headings={document.headings} />
          </details>
        )}
        {/* Only remark/rehype output: raw HTML is discarded, URLs are filtered in content.ts. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted compiler output, never raw Markdown HTML */}
        <div className={styles.prose} dangerouslySetInnerHTML={{ __html: document.html }} />
        {page.overview && (
          <nav aria-label={`${page.title} pages`} className={styles.sectionPages}>
            <h2>In this section</h2>
            {pages
              .filter((p) => p.section === page.section && !p.overview)
              .map((p) => (
                <a href={`/docs/${p.slug}`} key={p.slug}>
                  <span>{p.title}</span>
                  <Icon name="arrow" />
                </a>
              ))}
          </nav>
        )}
        <footer className={styles.footer}>
          <Button variant="quiet" href={editUrl(page.source)} arrow>
            Edit on GitHub
          </Button>
          <nav aria-label="Previous and next pages" className={styles.pager}>
            <div>
              {previous && (
                <>
                  <span>Previous</span>
                  <Button variant="quiet" href={`/docs/${previous.slug}`}>
                    <Icon name="back" />
                    {previous.title}
                  </Button>
                </>
              )}
            </div>
            <div>
              {next && (
                <>
                  <span>Next</span>
                  <Button variant="quiet" href={`/docs/${next.slug}`}>
                    {next.title}
                    <Icon name="arrow" />
                  </Button>
                </>
              )}
            </div>
          </nav>
        </footer>
      </article>
      <aside className={styles.contents} aria-label="On this page">
        {document.headings.length > 0 && (
          <>
            <p>On this page</p>
            <Contents headings={document.headings} />
          </>
        )}
        <a href={editUrl(page.source)}>
          Edit on GitHub <Icon name="arrow" />
        </a>
      </aside>
    </div>
  );
}
function Contents({ headings }: { headings: { id: string; title: string; level: number }[] }) {
  return (
    <nav aria-label="Page contents">
      {headings
        .filter((h) => h.level <= 3)
        .map((h) => (
          <a key={h.id} href={`#${h.id}`} data-level={h.level}>
            {h.title}
          </a>
        ))}
    </nav>
  );
}
