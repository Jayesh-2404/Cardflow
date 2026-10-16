import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keep a textarea sized to its content: reset to `auto`, then read the height
 * the browser needs.
 *
 * A layout effect on purpose — the drawer's title and the note composer both
 * start one line tall, and doing this after paint shows the clipped height for
 * a frame. `scrollHeight` already includes padding, so callers keep their own
 * padding and only have to disable resizing and scrolling.
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}
