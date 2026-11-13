// A few words beside a control, the one tooltip look: an icon's name while the pointer or the keyboard
// is on it (inside an element with `group/tip`), or a word said for a moment after a press, as Copied
// is. Beside the control, so it never takes the place of anything.
const LOOK =
  'pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 whitespace-nowrap bg-action px-space-8 py-space-4 type-ui text-on-action';
const ON_HOVER = 'invisible group-hover/tip:visible group-focus-visible/tip:visible';
const SIDE = { right: 'left-full ml-space-8', left: 'right-full mr-space-8' } as const;

export type TipSide = keyof typeof SIDE;

export function Tip({
  label,
  side,
  said = false,
}: {
  label: string;
  side: TipSide;
  /** Said now, for a moment, after a press: shown whatever the pointer does, and heard. */
  said?: boolean;
}) {
  if (said) {
    return (
      <span role="status" className={`${LOOK} ${SIDE[side]}`}>
        {label}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`${LOOK} ${ON_HOVER} ${SIDE[side]}`}>
      {label}
    </span>
  );
}
