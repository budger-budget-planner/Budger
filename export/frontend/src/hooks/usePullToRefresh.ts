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
  const startScrollTop = useRef(0);
  const gestureLockedOut = useRef(false);
  const committed = useRef(false); // true once a move has been claimed as a vertical pull
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  disabledRef.current = disabled;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const currentElement = containerRef.current;
    if (!currentElement) return;
    const element: HTMLElement = currentElement;

    const MAX_TRAVEL = 88; // cap on how far the indicator visually travels
    const TOP_EPSILON = 1; // tolerate sub-pixel scroll positions on mobile browsers

    function documentScrollTop() {
      return Math.max(
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );
    }

    function isAtTop() {
      return element.scrollTop <= TOP_EPSILON && documentScrollTop() <= TOP_EPSILON;
    }

    function resetVisuals() {
      committed.current = false;
      pullRef.current = 0;
      setPull(0);
      setPullPx(0);
      setDragging(false);
    }

    function cancelGesture() {
      element.removeEventListener("touchmove", handleMove);
      startY.current = null;
      gestureLockedOut.current = true;
      resetVisuals();
    }

    function handleMove(e: TouchEvent) {
      if (
        startY.current == null ||
        gestureLockedOut.current ||
        disabledRef.current ||
        refreshingRef.current
      ) return;

      // A pull-to-refresh gesture must begin at the top and stay there. If
      // this touch began below the top, or the browser has scrolled the
      // container during the gesture, hand control back to native scrolling
      // for the rest of this touch — never re-arm PTR mid-gesture.
      if (
        startScrollTop.current > TOP_EPSILON ||
        !isAtTop()
      ) {
        cancelGesture();
        return;
      }

      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      if (!committed.current) {
        // Wait for a clear, mostly-vertical downward drag before claiming the
        // gesture — bails out cleanly for horizontal swipes (carousels, etc.).
        if (dy <= 6) return;
        if (Math.abs(dx) > dy) {
          cancelGesture();
          return;
        }
        committed.current = true;
        setDragging(true);
      }

      if (dy <= 0) { cancelGesture(); return; }
      if (e.cancelable) e.preventDefault();

      const threshold = window.innerHeight / 5; // ~1/5 of the screen
      const eased = threshold * (1 - Math.exp(-dy / threshold)); // spring-like resistance
      pullRef.current = Math.min(dy / threshold, 1);
      setPullPx(Math.min(eased, MAX_TRAVEL));
      setPull(pullRef.current);
    }

    function handleStart(e: TouchEvent) {
      if (disabledRef.current || refreshingRef.current) return;
      startY.current = null;
      gestureLockedOut.current = false;
      resetVisuals();

      // Do not arm the gesture for a touch that starts anywhere below the
      // actual scroll top. This is intentionally checked before recording
      // coordinates so scrolling back toward the top cannot become a PTR
      // gesture when the finger is released.
      if (!isAtTop()) {
        gestureLockedOut.current = true;
        return;
      }

      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      startScrollTop.current = element.scrollTop;
      // Only add the non-passive listener when at the top — this lets the
      // browser use the fast compositor scroll path at all other positions.
      element.addEventListener("touchmove", handleMove, { passive: false });
    }

    async function handleEnd() {
      // Always clean up the dynamically-added move listener.
      element.removeEventListener("touchmove", handleMove);

      if (!committed.current || gestureLockedOut.current) {
        startY.current = null;
        return;
      }
      committed.current = false;
      startY.current = null;
      gestureLockedOut.current = true;
      setDragging(false);
      const triggered = pullRef.current >= 1;

      if (triggered) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(1);
        setPullPx(56); // settle at the loading-indicator resting height
        try {
          await onRefreshRef.current();
        } catch {
          // Keep the gesture handler non-rejecting so touchend/touchcancel
          // cannot create an unhandled promise rejection. The caller owns the
          // user-facing retry feedback.
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
          setPullPx(0);
          pullRef.current = 0;
        }
      } else {
        resetVisuals();
      }
    }

    element.addEventListener("touchstart", handleStart, { passive: true });
    element.addEventListener("touchend", handleEnd, { passive: true });
    element.addEventListener("touchcancel", handleEnd, { passive: true });
    return () => {
      element.removeEventListener("touchstart", handleStart);
      element.removeEventListener("touchmove", handleMove);
      element.removeEventListener("touchend", handleEnd);
      element.removeEventListener("touchcancel", handleEnd);
    };
    // Deliberately only re-binds if the container itself changes — disabled/
    // onRefresh are read via refs above so they stay fresh without tearing
    // down listeners mid-gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  return { pull, pullPx, refreshing, dragging };
}
