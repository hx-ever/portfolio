import { ACTIVITY_MOVE_PX } from "./config";

/**
 * Passive window listeners notify m_7's boredom timer of visitor activity.
 * Installed on first use and removed when the last consumer releases them.
 */

let moveOriginX = NaN;
let moveOriginY = NaN;
const listeners = new Set<() => void>();
let users = 0;

/** Called synchronously on each activity (keep it trivial). */
export function onActivity(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const bump = () => {
  listeners.forEach((fn) => fn());
};

const onPointerMove = (e: PointerEvent) => {
  // Ignore sub-threshold jitter for activity.
  if (Number.isNaN(moveOriginX) || Math.hypot(e.clientX - moveOriginX, e.clientY - moveOriginY) > ACTIVITY_MOVE_PX) {
    moveOriginX = e.clientX;
    moveOriginY = e.clientY;
    bump();
  }
};

const OPTS = { passive: true } as const;

/** Install (refcounted). Returns the release function. */
export function retainActivity() {
  if (typeof window === "undefined") return () => {};
  if (users++ === 0) {
    window.addEventListener("pointermove", onPointerMove, OPTS);
    window.addEventListener("pointerdown", bump, OPTS);
    window.addEventListener("keydown", bump, OPTS);
    window.addEventListener("wheel", bump, OPTS);
    window.addEventListener("scroll", bump, OPTS);
    window.addEventListener("click", bump, OPTS);
  }
  return () => {
    if (--users > 0) return;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", bump);
    window.removeEventListener("keydown", bump);
    window.removeEventListener("wheel", bump);
    window.removeEventListener("scroll", bump);
    window.removeEventListener("click", bump);
  };
}
