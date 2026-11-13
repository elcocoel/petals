// A grade's five steps, lightest to darkest, as one bar of swatches (the look's grade, for a colour graded
// by a number or a date). Drawn, because its colours come from the look's own grade (hex), which no class names: the
// five steps side by side, a swatch high, nothing between them. Props only.
export function Ramp({ fills, label }: { fills: readonly string[]; label: string }) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${fills.length} 1`}
      preserveAspectRatio="none"
      className="block h-swatch-size w-full min-w-0"
    >
      {fills.map((f, i) => (
        // the steps are a ramp in their order, and two can share a colour
        // biome-ignore lint/suspicious/noArrayIndexKey: a step is its place in the ramp
        <rect key={i} x={i} y={0} width={1.02} height={1} fill={f} />
      ))}
    </svg>
  );
}
