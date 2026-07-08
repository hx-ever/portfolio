"use client";

import { useEffect, useRef, type RefObject } from "react";

export interface SectionPointer {
  /** cursor x within the section, -1 (left edge) .. 1 (right edge) */
  x: number;
  /** cursor y within the section, -1 (top) .. 1 (bottom) */
  y: number;
  /** whether the cursor is currently inside the section's bounds */
  inside: boolean;
}

/**
 * Tracks the cursor position relative to a section's bounding box, normalised
 * to [-1, 1] on each axis, plus whether the cursor is inside. Written to a ref
 * (not state) so a fast pointermove stream never re-renders React — consumers
 * read `ref.current` inside their own animation frame. When the cursor leaves
 * the section, `inside` flips to false so consumers can ease back to rest.
 */
export function useSectionPointer(ref: RefObject<HTMLElement | null>) {
  const pointer = useRef<SectionPointer>({ x: 0, y: 0, inside: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) {
        pointer.current.inside = false;
        return;
      }
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;
      pointer.current = {
        x: Math.max(-1, Math.min(1, (e.clientX - (rect.left + halfW)) / halfW)),
        y: Math.max(-1, Math.min(1, (e.clientY - (rect.top + halfH)) / halfH)),
        inside: true,
      };
    };

    // Pointer leaving the window entirely also counts as leaving the section.
    const onLeave = () => {
      pointer.current.inside = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [ref]);

  return pointer;
}
