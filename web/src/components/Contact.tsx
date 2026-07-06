"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_ACCENT } from "@/lib/sections";
import styles from "./Contact.module.css";

const MAX_SCALE = 0.35; // icon under cursor reaches 1 + 0.35 = 1.35x
const MAX_LIFT = 18; // px upward at full magnification
const RADIUS = 130; // falloff radius; neighbors shrink proportionally
// The 14px tooltip-to-icon gap lives in the CSS rest position (.tooltip
// bottom); topRise() keeps it constant while the icon lifts.

const ICONS = [
  {
    key: "email",
    label: "Email Me",
    href: "mailto:intern@hankhsu.com",
    external: false,
  },
  {
    key: "github",
    label: "View GitHub",
    href: "https://github.com/hx-ever",
    external: true,
  },
  {
    key: "linkedin",
    label: "Connect on LinkedIn",
    href: "https://www.linkedin.com/in/hsinweihsu",
    external: true,
  },
] as const;

export default function Contact() {
  const dockRef = useRef<HTMLDivElement | null>(null);
  const iconRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useRef(false);

  // Which icon the tooltip names (label + visibility). Position is written
  // imperatively so it shares the icons' exact transition timing.
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const iconCenter = (i: number) => {
    const el = iconRefs.current[i];
    return el ? el.offsetLeft + el.offsetWidth / 2 : 0;
  };

  // Smooth cosine-squared falloff — continuous, no discrete tiers.
  const influence = (dx: number) => {
    const u = Math.min(Math.abs(dx) / RADIUS, 1);
    const c = Math.cos((u * Math.PI) / 2);
    return c * c;
  };

  // How far the icon's top edge has risen at influence g: the lift plus the
  // scale growth (transform-origin is the icon's bottom).
  const topRise = (g: number, iconHeight: number) => g * (MAX_LIFT + MAX_SCALE * iconHeight);

  /**
   * Anchor the tooltip over icon `i` at influence `g`. The tooltip's rest
   * position already sits TOOLTIP_GAP above the icon's rest top edge, and
   * this translateY tracks the icon's rise. Both elements retarget the
   * same transition curve at the same moments, so the gap holds
   * mid-animation too. `snap` places it without transition (first
   * appearance / keyboard jumps).
   */
  const positionTooltip = (i: number, g: number, snap: boolean) => {
    const tip = tooltipRef.current;
    const el = iconRefs.current[i];
    if (!tip || !el) return;
    const rise = reducedMotion.current ? 0 : topRise(g, el.offsetHeight);
    const transform = `translate(calc(${iconCenter(i).toFixed(0)}px - 50%), ${(-rise).toFixed(1)}px)`;
    if (snap) {
      tip.style.transition = "none";
      tip.style.transform = transform;
      void tip.offsetWidth;
      tip.style.transition = "";
    } else {
      tip.style.transform = transform;
    }
  };

  const onDockMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const dock = dockRef.current;
    if (!dock) return;
    const rect = dock.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;

    // Ambient light follows the cursor across the glass.
    if (!reducedMotion.current) {
      dock.style.setProperty("--lx", `${cursorX.toFixed(0)}px`);
      dock.style.setProperty("--ly", `${(event.clientY - rect.top).toFixed(0)}px`);
    }

    let nearest = -1;
    let nearestDist = Infinity;
    ICONS.forEach((_, i) => {
      const el = iconRefs.current[i];
      if (!el) return;
      const dx = cursorX - iconCenter(i);
      if (Math.abs(dx) < nearestDist) {
        nearestDist = Math.abs(dx);
        nearest = i;
      }
      if (reducedMotion.current) return;

      const g = influence(dx);
      el.style.transform = `translateY(${(-MAX_LIFT * g).toFixed(1)}px) scale(${(1 + MAX_SCALE * g).toFixed(3)})`;
      el.style.filter = `brightness(${(1 + 0.28 * g).toFixed(3)})`;
      el.style.boxShadow = `0 ${(6 + 10 * g).toFixed(0)}px ${(14 + 20 * g).toFixed(0)}px rgba(41, 151, 255, ${(0.5 * g).toFixed(3)})`;
    });

    if (nearest >= 0) {
      positionTooltip(nearest, influence(cursorX - iconCenter(nearest)), activeIndex === -1);
    }
    if (nearest !== activeIndex) setActiveIndex(nearest);
  };

  const onDockMouseLeave = () => {
    iconRefs.current.forEach((el) => {
      if (!el) return;
      el.style.transform = "";
      el.style.filter = "";
      el.style.boxShadow = "";
    });
    setActiveIndex(-1);
  };

  // Keyboard focus mirrors hover: CSS :focus-visible supplies the fully
  // magnified state, so anchor the tooltip at full influence.
  const onIconFocus = (i: number) => {
    positionTooltip(i, 1, true);
    setActiveIndex(i);
  };
  const onIconBlur = () => setActiveIndex(-1);

  // Soft ripple expanding from the clicked icon. The host span is owned by
  // React; ripples are appended imperatively and clean themselves up.
  const onIconClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const host = event.currentTarget.querySelector(`.${styles.rippleHost}`);
    if (!host) return;
    const ripple = document.createElement("span");
    ripple.className = styles.ripple;
    ripple.addEventListener("animationend", () => ripple.remove());
    host.appendChild(ripple);
  };

  return (
    <section
      id="contact"
      className={styles.section}
      style={{ "--accent": HERO_ACCENT } as React.CSSProperties}
    >
      <div className={styles.glow} aria-hidden="true" />

      <span className={styles.eyebrow}>CONTACT</span>
      <h2 className={styles.headline}>Let&rsquo;s Build</h2>
      <p className={styles.support}>Interested in design engineering roles.</p>

      <div className={styles.dockWrap}>
        <div
          ref={tooltipRef}
          className={styles.tooltip}
          data-visible={activeIndex >= 0}
          aria-hidden="true"
        >
          {activeIndex >= 0 ? ICONS[activeIndex].label : ""}
        </div>

        <div
          ref={dockRef}
          className={styles.dock}
          onMouseMove={onDockMouseMove}
          onMouseLeave={onDockMouseLeave}
        >
          {ICONS.map((icon, i) => (
            <a
              key={icon.key}
              ref={(el) => {
                iconRefs.current[i] = el;
              }}
              className={styles.icon}
              href={icon.href}
              aria-label={icon.label}
              {...(icon.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onFocus={() => onIconFocus(i)}
              onBlur={onIconBlur}
              onClick={onIconClick}
            >
              <span className={styles.iconInner}>
                <IconGlyph name={icon.key} />
                <span className={styles.rippleHost} aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </div>

      <p className={styles.footnote}>Replies within 3 hours.</p>
    </section>
  );
}

function IconGlyph({ name }: { name: (typeof ICONS)[number]["key"] }) {
  if (name === "email") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="2.5" y="5" width="19" height="14" rx="3" />
        <path d="m3.5 7 7.4 5.4a2 2 0 0 0 2.2 0L20.5 7" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "github") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}
