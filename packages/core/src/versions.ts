// Contract versions (T016). A contract change bumps its version here and in specs/.../contracts/.
export const PACKAGES_VERSION = 'packages/v1';
export const TOOLS_VERSION = 'tools/v1';
export const API_VERSION = 'api/v1';
export const MAP_VERSION = 'map/v2';
export const RENDER_VERSION = 'render/v1';
export const READING_VERSION = 'reading/v1';
export const RECIPE_VERSION = 'recipe/v1';
export const CONVENTION_VERSION = 'default/v1';
export const CLAIM_VERSION = 'claim/v1';

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
} as const;
