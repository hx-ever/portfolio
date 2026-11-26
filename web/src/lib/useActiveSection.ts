"use client";

import { useEffect, useState } from "react";

/** Which section id currently crosses the vertical center of the viewport. */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const center = window.innerHeight / 2;
      const section = els.find((el) => {
        const { top, bottom } = el.getBoundingClientRect();
        return top <= center && bottom > center;
      });
      setActive(section?.id ?? "");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [ids]);

  return active;
}
