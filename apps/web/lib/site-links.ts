// Where the site's words point, in one place. Landing anchors start with / so they work from any page.

/** /make puts q in its box, unsent: one press asks it. */
export const askHref = (question: string) => `/make?q=${encodeURIComponent(question)}`;

export const siteLinks = {
  home: '/',
  make: '/make',
  gallery: '/gallery',
  connect: '/connect',
  howItWorks: '/#how-it-works',
  community: '/#community',
  /** No address yet. In-page, so nothing is invented; the coordinator holds the list. */
  noDestination: '#',
} as const;
