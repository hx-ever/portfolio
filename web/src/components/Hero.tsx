"use client";

import { useEffect, useState } from "react";
import ModelCanvas from "./three/ModelCanvas";
import ChibiCharacter from "./three/ChibiCharacter";
import styles from "./Hero.module.css";

export default function Hero() {
  const [scrolledOnce, setScrolledOnce] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 40) setScrolledOnce(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section id="top" className={styles.hero}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>
        <div>
          <h1 className={styles.headline}>
            Hi, I am
            <br />
            Hsu Hsin-Wei<span className={styles.dot}>.</span>
          </h1>
          <p className={styles.tagline}>
            <span className={styles.taglineBar} />
            <span className={styles.taglineText}>Design Engineer</span>
          </p>
        </div>
        <div className={styles.stage}>
          <ModelCanvas cameraPosition={[0, 0.15, 4.6]} fov={30}>
            <ChibiCharacter />
          </ModelCanvas>
        </div>
      </div>
      <div className={`${styles.scrollCue} ${scrolledOnce ? styles.hidden : ""}`}>
        SCROLL ↓
      </div>
    </section>
  );
}
