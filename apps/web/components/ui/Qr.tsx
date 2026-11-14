// A QR code of a short text (an address to send to), for a phone's camera: drawn as one path of dark squares
// in the text colour on the page's surface, with the quiet border a reader needs, at a drawing's size. Props only.
import { encode } from 'uqr';

export function Qr({ text, label }: { text: string; label: string }) {
  const { data, size } = encode(text, { border: 2 });
  let d = '';
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (data[y]?.[x]) d += `M${x} ${y}h1v1h-1z`;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-drawing-144 shrink-0 bg-surface text-primary"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}
