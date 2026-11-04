import { notImplemented } from '@petal/core';
import type { MapReader, MapWriter } from './index.ts';

export function fakeMap(): MapWriter & MapReader {
  return notImplemented('fakeMap');
}
