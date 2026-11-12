import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalog, content, editUrl } from '../../../../components/docs/content.ts';
import styles from '../../../../components/docs/docs.module.css';
import { byDepartment } from '../../../../components/docs/groups.ts';
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
      <article id="doc-content" tabIndex={-1} className={styles.article} data-kind={page.kind}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            <a href="/docs">Docs</a>
            <Icon name="chevron" small />
            <span>{section?.title}</span>
          </div>
          <div className={styles.kindLabel}>
            <Icon name={page.kind === 'guide' ? 'petals' : 'project'} small />
            <span>{page.kind === 'guide' ? 'Guide' : 'System reference'}</span>
          </div>
          <h1 className="type-heading">{page.title}</h1>
          {page.kind === 'reference' && (
            <div className={styles.provenance}>
              <span>Rendered from source</span>
              <a href={editUrl(page.source)}>
                <code>{page.source}</code>
              </a>
            </div>
          )}
          {page.status && <p className={styles.status}>Brain status: {page.status}</p>}
        </header>
        {document.headings.length > 0 && (
          <details className={styles.mobileContents}>
            <summary>On this page</summary>
            <Contents headings={document.headings} />
          </details>
        )}
        {/* Only remark/rehype output: raw HTML is discarded, URLs are filtered in content.ts. */}
        <div
          className={`${styles.prose} type-label`}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted compiler output, never raw Markdown HTML
          dangerouslySetInnerHTML={{ __html: document.html }}
        />
        {document.reference && (
          <section className={styles.generatedReference} aria-label="Generated system reference">
            <div className={styles.kindLabel}>
              <Icon name="project" small />
              <span>System reference</span>
            </div>
            <p className={styles.provenance}>
              <span>Generated from source</span>
              <a href={editUrl('packages/core/src/view/index.ts')}>View definitions</a>
              <a href={editUrl('apps/web/lib/person-view.ts')}>Person's default view</a>
            </p>
            <div
              className={`${styles.prose} type-label`}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: compiled Markdown, same filtering as the main document
              dangerouslySetInnerHTML={{ __html: document.reference.html }}
            />
          </section>
        )}
        {page.overview && (
          <nav aria-label={`${page.title} pages`} className={styles.sectionPages}>
            {(['guide', 'reference'] as const).flatMap((kind) =>
              byDepartment(
                pages.filter((p) => p.section === page.section && !p.overview && p.kind === kind),
              ).map((group) => (
                <section key={`${kind}:${group.department ?? ''}`} data-kind={kind}>
                  <h2>
                    <Icon name={kind === 'guide' ? 'petals' : 'project'} small />
                    {group.title ?? (kind === 'guide' ? 'Guides' : 'System reference')}
                  </h2>
                  {group.pages.map((p) => (
                    <a href={`/docs/${p.slug}`} key={p.slug}>
                      <span>{p.hub ? 'Overview' : p.title}</span>
                      <Icon name="arrow" />
                    </a>
                  ))}
                </section>
              )),
            )}
          </nav>
        )}
        <footer className={styles.footer}>
          {page.kind === 'guide' && (
            <div className={styles.guideSource}>
              <span>Guide source</span>
              <code>{page.source}</code>
            </div>
          )}
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
