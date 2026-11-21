/**
 * Tiny in-memory bridge between the trigger (keyboard anywhere, toast link
 * on another page) and m_7 on the home page. Module state, so a request
 * made on /experience survives client-side navigation to "/" — no URL
 * parameter, no storage. A full reload clears it.
 */

type Listener = () => void;

let pending = false;
let dancing = false;
const startListeners = new Set<Listener>();

/** Queue a dance. Ignored while one is already queued or playing. */
export function requestDance() {
  if (pending || dancing) return false;
  pending = true;
  return true;
}

export const isDancePending = () => pending;
export const isDancing = () => dancing;

/** m_7 calls this when it actually starts the queued dance. */
export function markDanceStarted() {
  pending = false;
  dancing = true;
  startListeners.forEach((fn) => fn());
}

/** m_7 calls this once he's crossfaded back to Idle. */
export function markDanceFinished() {
  dancing = false;
}

/** Fired at the moment the dance starts (drives the home-page toast). */
export function onDanceStart(fn: Listener) {
  startListeners.add(fn);
  return () => {
    startListeners.delete(fn);
  };
}
