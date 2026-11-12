// The brain's files, for code that runs them (specs/005-mapping-brain/brain.md). The files are the
// source; this only gathers them, so a bundle carries them. Every recipe in recipes/ is listed here,
// and a test checks that none is missing.
import molochV3 from './governance/recipes/moloch-v3.json' with { type: 'json' };

/** Every reading recipe, as its file holds it. Checked by @petal/inputs before anything runs one. */
export const RECIPE_FILES: readonly unknown[] = [molochV3];
