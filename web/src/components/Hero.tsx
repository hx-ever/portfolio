"use client";

import { useEffect, useState } from "react";
import ModelCanvas from "./three/ModelCanvas";
import HeroCharacter from "./three/HeroCharacter";
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
      {/* Full-width character layer: sits above the background and text so the
          walk-in path is never clipped by a container edge or covered. */}
      <div className={styles.characterLayer} aria-hidden="true">
        <ModelCanvas cameraPosition={[0, 0.15, 4.6]} fov={30}>
          <HeroCharacter />
        </ModelCanvas>
      </div>

      <div className={styles.content}>
        <div className={styles.copy}>
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
      </div>
      <div className={`${styles.scrollCue} ${scrolledOnce ? styles.hidden : ""}`}>
        SCROLL ↓
      </div>
    </section>
  );
}
