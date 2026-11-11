// Contract versions (T016). A contract change bumps its version here and in specs/.../contracts/.
export const PACKAGES_VERSION = 'packages/v1';
/**
 * tools/v2 since 9 Nov: the brain's tools (brain_route, brain_file, brain_index), layers on the site
 * (keep_layer, list_layers, fork_dataset), jobs (take_job, report_job, list_jobs), compose_view's seam and
 * hand_job's to. A flower entry keeps the tools_version that drew it, so old entries still say tools/v1.
 */
export const TOOLS_VERSION = 'tools/v2';
export const API_VERSION = 'api/v1';
export const MAP_VERSION = 'map/v2';
export const RENDER_VERSION = 'render/v2';
export const READING_VERSION = 'reading/v1';
export const RECIPE_VERSION = 'recipe/v1';
export const CONVENTION_VERSION = 'default/v1';
/** claim/v2 since 10 Nov: annotations (annotation-layer.md). v1 still reads, and chain reads are still v1. */
export const CLAIM_VERSION = 'claim/v2';
/**
 * A person's view: which piece of data each dimension shows (specs/006-the-map/contracts/view.md). view/v2
 * since 11 Nov adds labels (annotation-layer.md, step 6); a view/v1 still reads, with labels on identity.
 */
export const VIEW_VERSION = 'view/v2';

export const VERSIONS = {
  packages: PACKAGES_VERSION,
  tools: TOOLS_VERSION,
  api: API_VERSION,
  map: MAP_VERSION,
  render: RENDER_VERSION,
  reading: READING_VERSION,
  recipe: RECIPE_VERSION,
  convention: CONVENTION_VERSION,
  claim: CLAIM_VERSION,
  view: VIEW_VERSION,
} as const;
