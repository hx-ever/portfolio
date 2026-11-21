import { KEY_GAP_RESET_MS, KONAMI_SEQUENCE } from "./config";

const SEQ: readonly string[] = KONAMI_SEQUENCE;

const isEditable = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

/**
 * Longest prefix of the sequence that is also a suffix of the keys typed so
 * far, after a mismatch at `progress` with `key`. For this sequence that is
 * 1 for a stray ArrowUp (restart at step 1) — and 2 for "↑ ↑ ↑", so an
 * extra leading up-press doesn't throw the code away. Everything else → 0.
 */
function fallback(progress: number, key: string) {
  const typed = [...SEQ.slice(0, progress), key];
  for (let len = Math.min(progress, SEQ.length - 1); len > 0; len--) {
    let ok = true;
    for (let i = 0; i < len; i++) {
      if (typed[typed.length - len + i] !== SEQ[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return len;
  }
  return 0;
}

/**
 * Installs one window keydown listener that tracks Konami progress. It never
 * calls preventDefault, so arrow-key scrolling (and the Experience page's
 * scroll friction, which listens to wheel/touch) is untouched. Returns the
 * cleanup function.
 */
export function listenForKonami(onComplete: () => void) {
  let progress = 0;
  let lastAt = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditable(event.target)) return;
    const key = event.key.toLowerCase();

    const now = event.timeStamp;
    if (now - lastAt > KEY_GAP_RESET_MS) progress = 0;
    lastAt = now;

    if (key === SEQ[progress]) {
      progress += 1;
      if (progress === SEQ.length) {
        progress = 0;
        onComplete();
      }
    } else {
      progress = fallback(progress, key);
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
