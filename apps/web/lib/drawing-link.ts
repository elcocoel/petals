// A link in the conversation to one of this site's flowers, so the workspace opens it on its own canvas
// rather than sending the person away (Elco, 10 Nov: "you're gonna link me to outside the work surface?").
// A published one is /f/<id>; render_flower's view_url is /draft?spec=, holding the spec itself; a view on
// the map is /d/<sha>, the server's way there. Any may come whole (https://this-site/…) or as a path. Pure.

export type DrawingLink = { stored: string } | { draft: string } | { sha: string };

const SHA = /^[0-9a-f]{64}$/;

/** What a link points at on this site, or null for anything else (another site, another page). */
export function drawingLink(href: string, origin: string): DrawingLink | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  const stored = /^\/f\/([^/]+)$/.exec(url.pathname)?.[1];
  if (stored) return { stored: decodeURIComponent(stored) };
  if (url.pathname === '/draft') {
    const draft = url.searchParams.get('spec');
    return draft ? { draft } : null;
  }
  const d = /^\/d\/([^/]+)$/.exec(url.pathname)?.[1];
  return d && SHA.test(d) ? { sha: d } : null;
}
