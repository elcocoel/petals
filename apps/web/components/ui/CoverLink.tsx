// A link laid over a figure, covering all of it, so a press anywhere on the figure follows it and nothing under it
// is steered. It stays out of the tab order: a visible link to the same place beside it (a Button) is the one a
// keyboard reaches; a screen reader reads this one by its hidden label. Its parent is the positioned figure.
export function CoverLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} tabIndex={-1} className="absolute inset-0">
      <span className="sr-only">{label}</span>
    </a>
  );
}
