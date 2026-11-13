// The words of the pages the bouncer heads (components/Oops.tsx), besides /make's own (lib/door-words.ts
// notSignedInWords).

export const oopsWords = {
  notFound: {
    title: 'Oops, there’s nothing here.',
    body: 'The link may be old, or the page has moved.',
  },
  broke: {
    title: 'Oops, something went wrong.',
    body: 'That one’s on us. Try again.',
    again: 'Try again',
  },
  home: 'Back to the front page',
  map: 'Open the Power Map',
} as const;
