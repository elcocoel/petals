// Server only. What the flower and draft views need besides the entry: the render (SVG, legend,
// petals) and the snapshot's source URLs, so source ids can be links.
import type { LegendItem, PetalDetail, Spec, View } from '@petal/core/types';
import { api, post } from './api.ts';

export interface Rendered {
  spec_sha256: string;
  render_sha256: string;
  svg: string;
  legend: LegendItem[];
  petals: PetalDetail[];
  view_url: string;
}

/** Drawn in the person's view (lib/viewer-view.ts), as every petal they look at is. */
export async function renderSpec(spec: Spec, view: View) {
  return post<Rendered>('/api/v1/render', { spec, include_svg: true, view });
}

export async function sourceUrls(sha256: string): Promise<Record<string, string>> {
  const res = await api<{ sources?: { id: string; url: string }[] }>(
    `/api/v1/snapshots/${encodeURIComponent(sha256)}/describe`,
  );
  if (!res.ok) return {};
  return Object.fromEntries((res.value.sources ?? []).map((s) => [s.id, s.url]));
}
