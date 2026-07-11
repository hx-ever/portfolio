"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasHover, prefersReducedMotion } from "@/lib/reducedMotion";
import styles from "./Nav.module.css";

const REST_DISPLACE = 3;
const THICK_DISPLACE = 4.5;

export default function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);

  const navRef = useRef<HTMLElement | null>(null);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const displaceRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const reducedMotion = useRef(false);
  const hoverCapable = useRef(true);

  // Hover pill: a single element that slides/morphs between links.
  const [pill, setPill] = useState({ x: 0, w: 0, visible: false, snap: false });

  useEffect(() => {
    reducedMotion.current = prefersReducedMotion();
    hoverCapable.current = hasHover();
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      setPastHero(window.scrollY > window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Cursor-tracked specular highlight: writes a CSS var directly on the
  // nav (no React re-render per mousemove); the ::before layer translates
  // a few px toward the cursor.
  const onNavMouseMove = (event: React.MouseEvent) => {
    if (reducedMotion.current) return;
    const nav = navRef.current;
    if (!nav) return;
    const rect = nav.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    nav.style.setProperty("--spec-shift", `${(px * 16).toFixed(1)}px`);
  };

  const onLinkEnter = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // touch: taps navigate; a glass pill with no mouseleave would stick
    if (!hoverCapable.current) return;
    const el = event.currentTarget;
    setPill((p) => ({
      x: el.offsetLeft,
      w: el.offsetWidth,
      visible: true,
      // Position snaps (no slide) when appearing from hidden, and always
      // under reduced motion; opacity/scale still fade via CSS.
      snap: !p.visible || reducedMotion.current,
    }));
    if (displaceRef.current) displaceRef.current.scale.baseVal = THICK_DISPLACE;
  };

  const onLinksLeave = () => {
    setPill((p) => ({ ...p, visible: false, snap: false }));
    if (displaceRef.current) displaceRef.current.scale.baseVal = REST_DISPLACE;
  };

  const onHome = pathname === "/";

  return (
    <nav
      ref={navRef}
      className={`${styles.nav} ${scrolled ? styles.scrolled : ""}`}
      data-thick={pill.visible}
      onMouseMove={onNavMouseMove}
    >
      {/* Backdrop refraction: subtle noise-driven displacement layered into
          the backdrop-filter (browsers without url() support in
          backdrop-filter fall back to plain blur via the CSS cascade). */}
      <svg className={styles.defs} aria-hidden="true" focusable="false">
        <filter id="lg-distortion" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.014"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            ref={displaceRef}
            in="SourceGraphic"
            in2="noise"
            scale={REST_DISPLACE}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <Link href="/" className={styles.brand} aria-label="Hsu Hsin-Wei — home">
        <Image
          src="/hankhsu_logo_icon.svg"
          alt=""
          width={29}
          height={32}
          priority
        />
      </Link>
      <div ref={linksRef} className={styles.links} onMouseLeave={onLinksLeave}>
        <span
          className={`${styles.pill} ${pill.snap ? styles.snap : ""}`}
          data-visible={pill.visible}
          style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
          aria-hidden="true"
        />
        <Link
          href="/#auraeyez"
          onMouseEnter={onLinkEnter}
          className={onHome && pastHero ? styles.active : undefined}
        >
          Designs
        </Link>
        <Link
          href="/experience"
          onMouseEnter={onLinkEnter}
          className={pathname === "/experience" ? styles.active : undefined}
        >
          Experience
        </Link>
        <Link
          href="/contact"
          onMouseEnter={onLinkEnter}
          className={pathname === "/contact" ? styles.active : undefined}
        >
          Contact
        </Link>
      </div>
    </nav>
  );
}
