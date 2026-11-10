// The viewer's view (view/v1, specs/006-the-map/contracts/view.md): what each dimension draws, for every
// flower this person looks at. Elco, 9 Nov: the default view for all, until people can set their own (the
// lobby's settings, later); the agent's choices stay in each flower's spec as its proposal. This is the one
// place a person's own view comes in.

import type { View } from '@petal/core/types';
import { DEFAULT_VIEW } from '@petal/core/view';

export const viewerView = (): View => DEFAULT_VIEW;
