// The landing page's shell, one of them for every band: a surface edge to edge (data-surface flips every
// role inside, and the generated CSS paints the background and text), its content in a column as wide as
// the page, so a wider window gets more band and no longer lines. There are two
// kinds of section. `split` is text and a figure, divided by one ratio (splitText in packages/tokens),
// and the figure can take either side. `columns` is three equal columns under a head and over a foot.
// Nav and Footer are this too, with `bar` padding. Grayscale smoothing is how Figma draws type; macOS's
// default thickens it. `tone` picks a light band's ground and texture in version 2, and says nothing in v1.
import type { SurfaceName, ToneName } from '@petal/tokens';
import type { ReactNode } from 'react';

const PADDING = {
  section: 'px-block-gap py-page-inset md:px-page-inset md:py-section-padding',
  bar: 'px-block-gap py-block-gap md:px-page-inset',
} as const;

const RULES = { top: 'border-t border-hairline', bottom: 'border-b border-hairline' } as const;

const SPLIT = {
  end: 'grid grid-cols-1 items-start gap-column-gap lg:grid-cols-split',
  start: 'grid grid-cols-1 items-start gap-column-gap lg:grid-cols-split-flip',
} as const;
const COLUMNS = 'grid grid-cols-1 gap-column-gap md:grid-cols-3';

export function Section({
  kind = 'ground',
  tone,
  as = 'section',
  padding = 'section',
  layout,
  figure = 'end',
  rule,
  bleed = false,
  id,
  head,
  foot,
  children,
}: {
  kind?: SurfaceName;
  /** Which light ground: for a `ground` band. Without one it's the plain ground. */
  tone?: ToneName;
  as?: 'section' | 'footer' | 'nav';
  padding?: keyof typeof PADDING;
  /** Lays out the children: two of them for `split`, three for `columns`. */
  layout?: 'split' | 'columns';
  /** Which side a split's figure takes: the first child at `start`, the second at `end`. */
  figure?: keyof typeof SPLIT;
  /** A hairline on this edge, the whole width of the window. */
  rule?: keyof typeof RULES;
  /** A child runs out to the window's edges: the band clips what passes them, so the page never scrolls sideways. */
  bleed?: boolean;
  id?: string;
  /** What sits over and under a layout's columns. */
  head?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
}) {
  const Tag = as;
  const body =
    layout === 'split' ? (
      <div className={SPLIT[figure]}>{children}</div>
    ) : layout === 'columns' ? (
      <div className={COLUMNS}>{children}</div>
    ) : (
      children
    );
  return (
    <Tag
      data-surface={kind}
      data-tone={tone}
      data-b="surface"
      id={id}
      className={
        [rule && RULES[rule], bleed && 'overflow-x-clip'].filter(Boolean).join(' ') || undefined
      }
    >
      <div className={`mx-auto w-full max-w-page-width antialiased ${PADDING[padding]}`}>
        {head && <div className="mb-column-gap">{head}</div>}
        {body}
        {foot && <div className="mt-column-gap">{foot}</div>}
      </div>
    </Tag>
  );
}
