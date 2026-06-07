import { useState, useEffect, useCallback, useRef, type RefObject } from "react";

/**
 * Track width constant (px) used for thumb geometry calculations.
 * Must match the CSS width applied to the track element.
 */
export const TRACK_W = 300;

/** Minimum thumb width so it is always grab-able. */
export const MIN_THUMB = 36;

/** Milliseconds of inactivity before the scrollbar fades out. */
const HIDE_DELAY = 1800;

export interface FloatingScrollbarMetrics {
  thumbW: number;
  thumbX: number;
  hasOverflow: boolean;
}

export interface FloatingScrollbarControls {
  /** Whether the scrollbar is currently visible (opacity > 0). */
  visible: boolean;
  /** Cancel any pending hide timer and show immediately. */
  show: () => void;
  /** Schedule a hide after HIDE_DELAY ms (unless a drag is active). */
  scheduleHide: () => void;
  /** Set the dragging flag. While true, scheduleHide is a no-op. */
  setDragging: (active: boolean) => void;
}

export type FloatingScrollbarReturn = FloatingScrollbarMetrics & FloatingScrollbarControls;

/**
 * Reusable hook for the floating auto-hide horizontal scrollbar overlay.
 *
 * Works with ANY horizontally-scrollable container by passing its ref.
 *
 * Auto-hide behaviour:
 *  - Shows on scroll (from any source: drag-scroll, wheel, DnD auto-scroll)
 *  - Shows on mouseenter of the scroll container
 *  - Fades out after HIDE_DELAY ms of inactivity
 *  - Never hides while the thumb is being dragged
 *
 * The hook returns `show` / `scheduleHide` / `setDragging` so the component
 * can wire them to additional DOM events (e.g. track mouseenter/leave, thumb
 * pointerdown/up) without any prop-drilling.
 */
export function useFloatingHorizontalScrollbar(
  scrollRef: RefObject<HTMLElement | null>
): FloatingScrollbarReturn {
  const [thumbW, setThumbW] = useState(0);
  const [thumbX, setThumbX] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [visible, setVisible] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);

  // --- Visibility controls ---------------------------------------------------

  const show = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(true);
  }, []);

  const scheduleHide = useCallback(() => {
    if (draggingRef.current) return; // never hide while thumb is grabbed
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!draggingRef.current) setVisible(false);
    }, HIDE_DELAY);
  }, []);

  const setDragging = useCallback(
    (active: boolean) => {
      draggingRef.current = active;
      if (!active) scheduleHide();
    },
    [scheduleHide]
  );

  // --- Scroll metrics --------------------------------------------------------

  const compute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;

    // 1 px tolerance prevents floating-point false positives.
    if (scrollWidth <= clientWidth + 1) {
      setHasOverflow((prev) => (prev ? false : prev));
      return;
    }

    setHasOverflow(true);
    const tw = Math.max(MIN_THUMB, (clientWidth / scrollWidth) * TRACK_W);
    const scrollMax = scrollWidth - clientWidth;
    const thumbRange = TRACK_W - tw;
    const tx =
      scrollMax > 0 && thumbRange > 0
        ? Math.max(0, Math.min(thumbRange, (scrollLeft / scrollMax) * thumbRange))
        : 0;
    setThumbW(tw);
    setThumbX(tx);
  }, [scrollRef]);

  // --- Wire events to the scroll container ----------------------------------

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      compute();
      show();
      scheduleHide();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("mouseenter", show);
    el.addEventListener("mouseleave", scheduleHide);

    // ResizeObserver: recompute when viewport or content width changes.
    // Guard against jsdom (test environment) which does not implement it.
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(compute) : null;
    if (ro) {
      ro.observe(el);
      // Observe first child so filter changes that alter scrollWidth are caught.
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }

    compute(); // initial metrics on mount

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("mouseenter", show);
      el.removeEventListener("mouseleave", scheduleHide);
      ro?.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Stable refs — effect intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { thumbW, thumbX, hasOverflow, visible, show, scheduleHide, setDragging };
}
