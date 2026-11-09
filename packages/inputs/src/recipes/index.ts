// Every reading recipe in the brain, checked, as a module each (specs/005-mapping-brain/data.md).
import { RECIPE_FILES } from '@petal/brain';
import type { InputModule } from '../index.ts';
import { checkRecipe, type ReadingRecipe, recipeModule } from './recipe.ts';

export {
  checkRecipe,
  pullRecipe,
  type ReadingRecipe,
  recipeDescriptor,
  recipeModule,
  SHAPES,
} from './recipe.ts';

/** The brain's recipes, each checked once. A file that fails stops the build's tests, not a chat. */
export const RECIPES: readonly ReadingRecipe[] = RECIPE_FILES.map(checkRecipe);

export const recipeModules = (opts: { fixtures?: string } = {}): Record<string, InputModule> =>
  Object.fromEntries(RECIPES.map((r) => [r.id, recipeModule(r, opts)]));
