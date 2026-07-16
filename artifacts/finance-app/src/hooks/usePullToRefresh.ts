import { useEffect, useRef, useState } from "react";

/**
 * Native-feeling pull-to-refresh gesture bound directly to a scrollable
 * container. Only engages when the container is already scrolled to the very
 * top — otherwise a normal downward scroll (or a horizontal swipe, e.g. a
 * carousel) passes through untouched.
 *
 * The user must drag down roughly 1/5 of the viewport height to commit to a
 * refresh; releasing short of that snaps back with no effect.
 *
 * PERFORMANCE: the non-passive touchmove listener is registered dynamically —
 * only added in handleStart when scrollTop === 0 (PTR can engage), and always
 * removed in handleEnd. When the user is anywhere below the top, there is NO
 * non-passive listener on the container, so the browser can use the
 * compositor-thread fast path for scrolling.
 */
export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown> | unknown,
  disabled = false,
) {
  const [pull, setPull] = useState(0);       // 0..1 progress toward the trigger threshold
  const [pullPx, setPullPx] = useState(0);   // visual px the indicator/content is displaced
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const committed = useRef(false); // true once a move has been claimed as a vertical pull
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  disabledRef.current = disabled;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const MAX_TRAVEL = 88; // cap on how far the indicator visually travels

    function reset() {
      committed.current = false;
      pullRef.current = 0;
      setPull(0);
      setPullPx(0);
      setDragging(false);
    }

    function handleMove(e: TouchEvent) {
      if (startY.current == null || disabledRef.current || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      if (!committed.current) {
        // Wait for a clear, mostly-vertical downward drag before claiming the
        // gesture — bails out cleanly for horizontal swipes (carousels, etc.).
        if (dy <= 6 || Math.abs(dx) > dy || el.scrollTop > 0) return;
        committed.current = true;
        setDragging(true);
      }

      if (dy <= 0 || el.scrollTop > 0) { reset(); return; }
      if (e.cancelable) e.preventDefault();

      const threshold = window.innerHeight / 5; // ~1/5 of the screen
      const eased = threshold * (1 - Math.exp(-dy / threshold)); // spring-like resistance
      pullRef.current = Math.min(dy / threshold, 1);
      setPullPx(Math.min(eased, MAX_TRAVEL));
      setPull(pullRef.current);
    }

    function handleStart(e: TouchEvent) {
      if (disabledRef.current || refreshingRef.current) return;
      if (el.scrollTop > 0) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      // Only add the non-passive listener when at the top — this lets the
      // browser use the fast compositor scroll path at all other positions.
      el.addEventListener("touchmove", handleMove, { passive: false });
    }

    async function handleEnd() {
      // Always clean up the dynamically-added move listener.
      el.removeEventListener("touchmove", handleMove);

      if (!committed.current) { startY.current = null; return; }
      committed.current = false;
      startY.current = null;
      setDragging(false);
      const triggered = pullRef.current >= 1;

      if (triggered) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(1);
        setPullPx(56); // settle at the loading-indicator resting height
        try {
          await onRefreshRef.current();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
          setPullPx(0);
          pullRef.current = 0;
        }
      } else {
        reset();
      }
    }

    el.addEventListener("touchstart", handleStart, { passive: true });
    el.addEventListener("touchend", handleEnd, { passive: true });
    el.addEventListener("touchcancel", handleEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleStart);
      el.removeEventListener("touchmove", handleMove);
      el.removeEventListener("touchend", handleEnd);
      el.removeEventListener("touchcancel", handleEnd);
    };
    // Deliberately only re-binds if the container itself changes — disabled/
    // onRefresh are read via refs above so they stay fresh without tearing
    // down listeners mid-gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  return { pull, pullPx, refreshing, dragging };
}
