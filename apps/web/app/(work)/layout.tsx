// The pages where a person works, /make and /lobby (specs/004-workspace, B1: one side panel in both), share
// this layout, so the side panel is mounted once and stays while the page beside it changes: moving
// between conversations, or between the workspace and the lobby, is a move inside the page, not a load.
import type { ReactNode } from 'react';
import { WorkPanel } from './WorkPanel.tsx';

export default function WorkLayout({ children }: { children: ReactNode }) {
  return <WorkPanel>{children}</WorkPanel>;
}
