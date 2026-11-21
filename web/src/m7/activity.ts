import { ACTIVITY_MOVE_PX } from "./config";

/**
 * One shared, passive set of window listeners for m_7: it records the last
 * moment the visitor did anything (boredom timer) and where the pointer is
 * (gaze). Handlers only store numbers — no work, no React state. Installed
 * on first use and removed when the last consumer releases it.
 */

export interface PointerInfo {
  x: number; // clientX
  y: number; // clientY
  kind: "mouse" | "touch";
  /** mouse: cursor is inside the window. touch: a finger is down. */
  active: boolean;
  /** touch: when the finger lifted (performance.now ms). */
  releasedAt: number;
}

export const pointer: PointerInfo = { x: 0, y: 0, kind: "mouse", active: false, releasedAt: 0 };

let lastActivityAt = typeof performance !== "undefined" ? performance.now() : 0;
let moveOriginX = NaN;
let moveOriginY = NaN;
const listeners = new Set<() => void>();
let users = 0;

/** performance.now() of the last real visitor activity. */
export const getLastActivityAt = () => lastActivityAt;

/** Called synchronously on each activity (keep it trivial). */
export function onActivity(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const bump = () => {
  lastActivityAt = performance.now();
  listeners.forEach((fn) => fn());
};

const onPointerMove = (e: PointerEvent) => {
  const touch = e.pointerType === "touch";
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.kind = touch ? "touch" : "mouse";
  if (!touch) pointer.active = true;
  // ignore sub-threshold jitter for activity, but always track position
  if (Number.isNaN(moveOriginX) || Math.hypot(e.clientX - moveOriginX, e.clientY - moveOriginY) > ACTIVITY_MOVE_PX) {
    moveOriginX = e.clientX;
    moveOriginY = e.clientY;
    bump();
  }
};

const onPointerDown = (e: PointerEvent) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.kind = e.pointerType === "touch" ? "touch" : "mouse";
  pointer.active = true;
  bump();
};

const onPointerUp = (e: PointerEvent) => {
  if (e.pointerType === "touch") {
    pointer.active = false;
    pointer.releasedAt = performance.now();
  }
};

// Touch drags: the browser cancels pointer events once it takes the
// gesture for scrolling, so follow the finger via (passive) touch events.
const onTouchMove = (e: TouchEvent) => {
  const t = e.touches[0];
  if (!t) return;
  pointer.x = t.clientX;
  pointer.y = t.clientY;
  pointer.kind = "touch";
  pointer.active = true;
};
const onTouchEnd = (e: TouchEvent) => {
  if (e.touches.length === 0) {
    pointer.active = false;
    pointer.releasedAt = performance.now();
  }
};

// Cursor left the window (relatedTarget null on the document element).
// Mouse only: a tap can fire a compatibility mouseout mid-touch.
const onMouseOut = (e: MouseEvent) => {
  if (!e.relatedTarget && pointer.kind === "mouse") pointer.active = false;
};
const onBlur = () => {
  if (pointer.kind === "mouse") pointer.active = false;
};

const OPTS = { passive: true } as const;

/** Install (refcounted). Returns the release function. */
export function retainActivity() {
  if (typeof window === "undefined") return () => {};
  if (users++ === 0) {
    lastActivityAt = performance.now();
    window.addEventListener("pointermove", onPointerMove, OPTS);
    window.addEventListener("pointerdown", onPointerDown, OPTS);
    window.addEventListener("pointerup", onPointerUp, OPTS);
    window.addEventListener("pointercancel", onPointerUp, OPTS);
    window.addEventListener("keydown", bump, OPTS);
    window.addEventListener("wheel", bump, OPTS);
    window.addEventListener("scroll", bump, OPTS);
    window.addEventListener("click", bump, OPTS);
    window.addEventListener("touchmove", onTouchMove, OPTS);
    window.addEventListener("touchend", onTouchEnd, OPTS);
    window.addEventListener("touchcancel", onTouchEnd, OPTS);
    document.documentElement.addEventListener("mouseout", onMouseOut, OPTS);
    window.addEventListener("blur", onBlur, OPTS);
  }
  return () => {
    if (--users > 0) return;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("keydown", bump);
    window.removeEventListener("wheel", bump);
    window.removeEventListener("scroll", bump);
    window.removeEventListener("click", bump);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    document.documentElement.removeEventListener("mouseout", onMouseOut);
    window.removeEventListener("blur", onBlur);
  };
}
