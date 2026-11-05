// Scrolled to the latest, also when a row grows, unless the reader scrolled up. A view hook: it knows
// the column it scrolls and nothing about the chat.
import { type RefObject, useEffect } from 'react';

export function useFollowScroll(
  thread: RefObject<HTMLElement | null>,
  following: RefObject<boolean>,
) {
  useEffect(() => {
    const column = thread.current;
    const content = column?.firstElementChild;
    if (!column || !content) return;
    const toEnd = () => {
      if (following.current) column.scrollTop = column.scrollHeight;
    };
    const onScroll = () => {
      const left = column.scrollHeight - column.clientHeight - column.scrollTop;
      following.current = left < 120;
    };
    const watch = new ResizeObserver(toEnd);
    watch.observe(content);
    column.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      watch.disconnect();
      column.removeEventListener('scroll', onScroll);
    };
  }, [thread, following]);
}
