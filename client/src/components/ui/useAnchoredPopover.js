import { useState, useLayoutEffect } from 'react';

const GAP = 6;
const MARGIN = 8;

/**
 * Positions a popover that is portaled to <body> against its trigger, so
 * scrolling / overflow-clipped containers (e.g. TaskModal) can't cut it off.
 * Clamps horizontally to the viewport and flips above the trigger when there
 * is no room below.
 *
 * `width` is a pixel number, or 'anchor' to match the trigger's width.
 * Returns a style object for the popover (hidden until measured).
 */
export default function useAnchoredPopover({ open, anchorRef, popRef, width, deps = [] }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const trigger = anchorRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const w = width === 'anchor' ? trigger.width : (popRef.current?.offsetWidth || width || 0);
      const h = popRef.current?.offsetHeight || 0;
      const vw = window.innerWidth, vh = window.innerHeight;
      const left = Math.max(MARGIN, Math.min(trigger.left, vw - w - MARGIN));
      const below = trigger.bottom + GAP;
      const above = trigger.top - GAP - h;
      const top = below + h > vh - MARGIN && above >= MARGIN
        ? above
        : Math.max(MARGIN, Math.min(below, vh - h - MARGIN));
      setPos({ left, top, width: width === 'anchor' ? trigger.width : undefined });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    position: 'fixed',
    left: pos?.left ?? -9999,
    top: pos?.top ?? -9999,
    ...(typeof width === 'number' ? { width } : pos?.width ? { width: pos.width } : {}),
    visibility: pos ? 'visible' : 'hidden',
  };
}
