'use client';
// The landing's way into the app (viewmodels/useFrontDoor.ts). A proposal for Elco, 8 Nov, not merged.
import { useFrontDoor } from '../../viewmodels/useFrontDoor.ts';

export function FrontDoor() {
  useFrontDoor();
  return null;
}
