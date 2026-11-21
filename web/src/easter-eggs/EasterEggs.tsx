"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TOAST } from "./config";
import { printConsoleMessage } from "./consoleMessage";
import { onDanceStart, requestDance } from "./danceBus";
import { listenForKonami } from "./konami";
import styles from "./EasterEggToast.module.css";

type ToastKind = "home" | "away" | null;

/**
 * Mounted once in the root layout. Renders nothing visible until an egg is
 * found: prints the DevTools note, listens for the Konami code, and shows
 * the glass-pill toast.
 */
export default function EasterEggs() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [kind, setKind] = useState<ToastKind>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const clearTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const show = (next: Exclude<ToastKind, null>) => {
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(clearTimer.current);
    setKind(next);
    // next frame, so the element renders at rest before transitioning in
    requestAnimationFrame(() => setVisible(true));
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      clearTimer.current = window.setTimeout(() => setKind(null), TOAST.transitionMs);
    }, TOAST.visibleMs);
  };
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  });

  useEffect(() => {
    printConsoleMessage();

    const stopKonami = listenForKonami(() => {
      if (pathRef.current === "/") {
        // m_7 picks this up (after his walk-in / model load if needed);
        // the toast appears when he actually starts dancing.
        requestDance();
      } else {
        showRef.current("away");
      }
    });
    const stopStart = onDanceStart(() => showRef.current("home"));

    return () => {
      stopKonami();
      stopStart();
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(clearTimer.current);
    };
  }, []);

  if (!kind) return null;

  return (
    <div
      className={styles.toast}
      data-visible={visible}
      data-interactive={kind === "away"}
      role="status"
      aria-live="polite"
    >
      {kind === "home" ? (
        TOAST.homeMessage
      ) : (
        <>
          {TOAST.awayMessage}
          <Link href="/" className={styles.link} onClick={() => requestDance()}>
            {TOAST.awayLinkLabel}
          </Link>
        </>
      )}
    </div>
  );
}
