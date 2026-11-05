// Scrolled to the latest, also when a flower finishes drawing, unless the reader scrolled up. A view
// hook: it knows the window and nothing about the chat.
import { type RefObject, useEffect } from 'react';

export function useFollowScroll(
  thread: RefObject<HTMLElement | null>,
  following: RefObject<boolean>,
) {
  useEffect(() => {
    const toEnd = () => {
      if (following.current) window.scrollTo(0, document.documentElement.scrollHeight);
    };
    const onScroll = () => {
      const left = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      following.current = left < 120;
    };
    const watch = new ResizeObserver(toEnd);
    if (thread.current) watch.observe(thread.current);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      watch.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [thread, following]);
}
