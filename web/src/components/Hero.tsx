"use client";

import { useEffect, useState } from "react";
import { preload } from "react-dom";
import { MASCOT_MODEL_URL } from "@/m7/config";
import HeroChat from "./HeroChat";
import ModelCanvas from "./three/ModelCanvas";
import styles from "./Hero.module.css";

const loadHeroCharacter = () => import("./three/HeroCharacter");

export default function Hero() {
  preload(MASCOT_MODEL_URL, { as: "fetch", crossOrigin: "anonymous", fetchPriority: "low" });
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
        <ModelCanvas
          loadModel={loadHeroCharacter}
          modelProps={{}}
          cameraPosition={[0, 0.15, 4.6]}
          fov={30}
        />
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
      <HeroChat />
      <div className={`${styles.scrollCue} ${scrolledOnce ? styles.hidden : ""}`}>
        SCROLL ↓
      </div>
    </section>
  );
}
