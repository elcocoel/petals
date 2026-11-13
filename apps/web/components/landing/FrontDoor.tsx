'use client';
// The landing's way into the app (viewmodels/useFrontDoor.ts).
import { useFrontDoor } from '../../viewmodels/useFrontDoor.ts';

export function FrontDoor() {
  useFrontDoor();
  return null;
}
