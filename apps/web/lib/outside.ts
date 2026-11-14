// A link off Petals opens in a new tab, never over the app, and the page it opens gets no hold on this one
// (rel noopener noreferrer). A link off Petals is an absolute http(s) address on another host; Petals' own pages,
// relative or on its own address, open in place. And a profile's declared links as addresses: a bare host as
// https, a handle on its service's page. Pure.
import { publicOrigin } from './site-links.ts';

const OWN = new URL(publicOrigin).host;

/** An absolute http(s) address on another host than Petals'. */
export function isOutside(href: string): boolean {
  if (!/^(https?:)?\/\//i.test(href.trim())) return false;
  try {
    return new URL(href.trim(), publicOrigin).host !== OWN;
  } catch {
    return false;
  }
}

/** What a link off Petals carries: a new tab, and no hold on this page. Nothing for Petals' own pages. */
export const outside = (href: string): { target?: '_blank'; rel?: 'noopener noreferrer' } =>
  isOutside(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {};

/** A handle as people type it: an @ or a trailing slash dropped. */
const handleOf = (v: string) => v.trim().replace(/^@+/, '').replace(/\/+$/, '');

const HANDLE = /^[A-Za-z0-9_.-]{1,64}$/;

/** The page a service gives a handle; services with none here take only full addresses. */
const SERVICE_PAGE: Partial<Record<string, (handle: string) => string>> = {
  twitter: (h) => `https://x.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  github: (h) => `https://github.com/${h}`,
  telegram: (h) => `https://t.me/${h}`,
};

/** A host with a dot and maybe a path, as people type a website: elementarycomplexity.com, www.x.org/a. */
const BARE_HOST = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?([/?#]\S*)?$/;

/**
 * A declared link as an address to open, or null when it can't be one (then it shows as text): a full http(s)
 * address as given; a bare host as https; a handle (X, GitHub, Telegram) on its service's page. Never any other
 * scheme, so a link can't run anything.
 */
export function linkHref(service: string, value: string): string | null {
  const v = value.trim();
  if (!v || /\s/.test(v)) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !BARE_HOST.test(v)) return null;
  const page = SERVICE_PAGE[service.toLowerCase()];
  const handle = handleOf(v);
  if (page && HANDLE.test(handle) && !handle.includes('.')) return page(handle);
  if (BARE_HOST.test(v)) {
    try {
      return new URL(`https://${v}`).href;
    } catch {
      return null;
    }
  }
  return page && HANDLE.test(handle) ? page(handle) : null;
}
