// The words of the pages the bouncer heads (components/Oops.tsx), besides /make's own (lib/door-words.ts
// notSignedInWords). Drafts for Elco (#78, 11 Nov), listed in design/journey-strings.md.

export const oopsWords = {
  notFound: {
    title: 'Oops, there’s nothing here.',
    body: 'The link may be old, or the page has moved.',
  },
  broke: {
    title: 'Oops, something went wrong.',
    body: 'That one’s on us. Try again, or go back to the front page.',
    again: 'Try again',
  },
  home: 'Back to the front page',
  map: 'Open the Power Map',
} as const;
