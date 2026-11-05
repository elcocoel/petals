// The rail's small line icons. Home and plus are Workspace / Navigation rail 43:748; the other two are
// drawn to match them, because the rail has more in it than the frame does.
const PATHS = {
  home: 'M2.25 8.25L9 2.25L15.75 8.25M3.75 7.5V15H7.5V10.5H10.5V15H14.25V7.5',
  plus: 'M9 3V9M9 9V15M9 9H3M9 9H15',
  gallery: 'M3 3H7.5V7.5H3ZM10.5 3H15V7.5H10.5ZM3 10.5H7.5V15H3ZM10.5 10.5H15V15H10.5Z',
  connect: 'M6.75 2.25V6M11.25 2.25V6M4.5 6H13.5V8.25A4.5 4.5 0 0 1 4.5 8.25ZM9 12.75V15.75',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.275"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-icon-size shrink-0"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
