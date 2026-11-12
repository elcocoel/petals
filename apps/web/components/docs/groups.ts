// /docs/brain by department (research/brain-departments-2026-11-11.md, step 9): a section's pages of one kind,
// split by the brain's department. Pages with none (the doctrine, the routing table) come first, then one
// group per department in the order its pages come, its hub first and the group named by it. No file reads
// here, so the sidebar (a client component) uses it too.
import type { DocPage } from './content.ts';

export interface DocGroup {
  /** the department, or none for the pages outside one */
  department?: string;
  /** the hub's title, for a department */
  title?: string;
  pages: DocPage[];
}

export function byDepartment(pages: DocPage[]): DocGroup[] {
  const outside = pages.filter((p) => !p.department);
  const groups: DocGroup[] = outside.length ? [{ pages: outside }] : [];
  for (const p of pages) {
    if (!p.department) continue;
    let g = groups.find((x) => x.department === p.department);
    if (!g) {
      g = { department: p.department, pages: [] };
      groups.push(g);
    }
    if (p.hub) {
      g.title = p.title;
      g.pages.unshift(p);
    } else g.pages.push(p);
  }
  return groups;
}
