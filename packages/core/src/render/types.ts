// A skin: a reading in, a drawing out. render_sha256 is renderFlower's, over whatever bytes come back.
import type { Reading, RenderResult } from '../types/index.ts';

export type Skin = (
  reading: Reading,
  options: { size: number; thumb: boolean },
) => Omit<RenderResult, 'render_sha256'>;
