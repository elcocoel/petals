// Whether an answer from the API means the thing asked for isn't there: none under that id, or an id that
// can't be one. A page that gets one shows the site's 404 (app/not-found.tsx, the bouncer; #78, 11 Nov). Pure.

export const isMissing = (error: { code: string; message: string }) =>
  error.code === 'not_found' || (error.code === 'bad_input' && error.message.startsWith('/id'));
