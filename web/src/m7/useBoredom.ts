"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BORED_AFTER_MS, VISIBLE_THRESHOLD } from "./config";
import { onActivity, retainActivity } from "./activity";
import type { M7StateMachine } from "./stateMachine";

/**
 * Idle boredom + welcome back.
 *
 *  - The quiet timer advances only inside m_7's render loop (so it already
 *    stops when the loop pauses off-screen or in a hidden tab), and pauses
 *    while less than VISIBLE_THRESHOLD of his canvas is on screen. Any
 *    activity — or any state other than IDLE — resets it, which is also the
 *    full-length cooldown after a greeting.
 *  - BORED_AFTER_MS of quiet → BORED (Sad). The next activity → GREETING
 *    (Win, one loop) → IDLE.
 *  - Coming back to a tab that was hidden for longer than BORED_AFTER_MS
 *    goes straight to GREETING (he noticed you were away).
 */
export function useBoredom(
  machine: M7StateMachine,
  /**
   * While this returns true, activity doesn't wake him yet — e.g. the first
   * keys of the Konami code, so typing it while he's bored goes straight to
   * DANCE instead of greeting first. The greeting fires once it's false.
   */
  holdGreeting: () => boolean = () => false
) {
  const gl = useThree((s) => s.gl);
  const quietMs = useRef(0);
  const visible = useRef(false);
  const greetPending = useRef(false);

  useEffect(() => {
    const release = retainActivity();

    const stopActivity = onActivity(() => {
      quietMs.current = 0;
      if (machine.getState() !== "BORED") return;
      if (holdGreeting()) greetPending.current = true;
      else machine.request("GREETING");
    });

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.intersectionRatio >= VISIBLE_THRESHOLD;
      },
      { threshold: [0, VISIBLE_THRESHOLD, 1] }
    );
    observer.observe(gl.domElement);

    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        return;
      }
      const away = performance.now() - hiddenAt;
      quietMs.current = 0;
      const state = machine.getState();
      if (hiddenAt && away > BORED_AFTER_MS && visible.current && (state === "IDLE" || state === "BORED")) {
        machine.request("GREETING");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      release();
      stopActivity();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [machine, gl, holdGreeting]);

  useFrame((_, delta) => {
    if (greetPending.current) {
      if (machine.getState() !== "BORED") greetPending.current = false;
      else if (!holdGreeting()) {
        greetPending.current = false;
        machine.request("GREETING");
      }
    }

    if (machine.getState() !== "IDLE") {
      quietMs.current = 0; // also the cooldown after a greeting
      return;
    }
    if (!visible.current) return; // paused while he's off-screen
    // real time, capped so a resumed loop doesn't jump the timer
    quietMs.current += Math.min(delta, 0.25) * 1000;
    if (quietMs.current >= BORED_AFTER_MS) {
      quietMs.current = 0;
      machine.request("BORED");
    }
  });
}
