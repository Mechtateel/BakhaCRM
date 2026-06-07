import { useEffect, type RefObject } from "react";

/**
 * Minimum horizontal pointer movement (px) before treating motion as a drag.
 * Keeps click events working normally.
 */
const DRAG_THRESHOLD = 4;

/**
 * Tags whose presence (anywhere in the ancestor chain up to the scroll
 * container) should suppress drag-scroll so interactive elements keep
 * working normally.
 */
const INTERACTIVE_TAGS = new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A",
  "LABEL",
  "OPTION",
  "DETAILS",
  "SUMMARY",
]);

function isInteractiveTarget(target: EventTarget | null, container: HTMLElement): boolean {
  let node = target as Element | null;
  while (node && node !== container) {
    if (INTERACTIVE_TAGS.has(node.tagName)) return true;
    if (node.hasAttribute("data-no-drag-scroll")) return true;
    const role = node.getAttribute("role");
    if (role === "button" || role === "link" || role === "checkbox" || role === "combobox") {
      return true;
    }
    if ((node as HTMLElement).isContentEditable) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Attaches AmoCRM-style horizontal drag-to-scroll behaviour to any
 * horizontally-scrollable container element.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useHorizontalDragScroll(ref);
 *   <div ref={ref} className="horizontal-drag-scroll overflow-x-auto ...">
 *
 * Interactive elements (button, input, select, a, label, …) and any element
 * with the `data-no-drag-scroll` attribute are excluded from triggering drag.
 *
 * Shift + mouse-wheel also scrolls the container horizontally.
 */
export function useHorizontalDragScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Mutable drag state – kept as plain variables so we avoid stale closures.
    let isDragging = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasMoved = false;

    function onMouseDown(event: MouseEvent): void {
      if (event.button !== 0) return; // left button only
      if (isInteractiveTarget(event.target, el!)) return;

      isDragging = true;
      startX = event.clientX;
      startScrollLeft = el!.scrollLeft;
      hasMoved = false;
    }

    function onMouseMove(event: MouseEvent): void {
      if (!isDragging) return;

      const dx = event.clientX - startX;

      if (!hasMoved) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        hasMoved = true;
        // Set grabbing cursor globally so it applies even over child elements.
        document.body.classList.add("is-drag-scrolling");
      }

      event.preventDefault();
      el!.scrollLeft = startScrollLeft - dx;
    }

    function stopDrag(): void {
      if (!isDragging) return;
      isDragging = false;
      hasMoved = false;
      document.body.classList.remove("is-drag-scrolling");
    }

    /**
     * Shift + scroll wheel → horizontal scroll.
     * Only activates when Shift is held, so normal vertical scroll is safe.
     */
    function onWheel(event: WheelEvent): void {
      if (!event.shiftKey) return;
      event.preventDefault();
      el!.scrollLeft += event.deltaY;
    }

    el.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopDrag);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", stopDrag);
      el.removeEventListener("wheel", onWheel);
      // Clean up body class if component unmounts mid-drag.
      document.body.classList.remove("is-drag-scrolling");
    };
    // ref is a stable object (from useRef); effect runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
