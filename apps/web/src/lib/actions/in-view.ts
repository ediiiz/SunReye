import type { Action } from "svelte/action";

/**
 * Fire `onEnter` the first time the node scrolls into view, and `onLeave` when
 * it scrolls back out — the history grid uses this to lazily mount charts (and
 * unmount off-screen live charts to stop their per-frame Tween) so 100+ entities
 * don't all fetch/animate at once. `rootMargin` pre-arms the node just before it
 * reaches the viewport so the chart is ready by the time it's visible.
 */
export const inView: Action<
  HTMLElement,
  { onEnter?: () => void; onLeave?: () => void; rootMargin?: string } | undefined
> = (node, params) => {
  let opts = params;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) opts?.onEnter?.();
        else opts?.onLeave?.();
      }
    },
    { rootMargin: params?.rootMargin ?? "200px" },
  );
  observer.observe(node);

  return {
    update(next) {
      opts = next;
    },
    destroy() {
      observer.disconnect();
    },
  };
};
