"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./Nav.module.css";

export default function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      setPastHero(window.scrollY > window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onHome = pathname === "/";

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ""}`}>
      <Link href="/" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        hxstudio
      </Link>
      <div className={styles.links}>
        <Link href="/#lumen" className={onHome && pastHero ? styles.active : undefined}>
          Designs
        </Link>
        <Link
          href="/experience"
          className={pathname === "/experience" ? styles.active : undefined}
        >
          Experience
        </Link>
        <Link href="/#contact">Contact</Link>
      </div>
    </nav>
  );
}
