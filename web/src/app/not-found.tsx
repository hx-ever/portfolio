import Link from "next/link";
import styles from "./not-found.module.css";

/**
 * On-brand 404: dark, typographic, one clear way home. Deliberately no 3D —
 * an error page shouldn't cost a multi-megabyte model download.
 */
export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <span className={styles.eyebrow}>404 — NOT FOUND</span>
      <h1 className={styles.headline}>
        Lost in the dark<span className={styles.dot}>.</span>
      </h1>
      <p className={styles.support}>
        This page doesn&rsquo;t exist — or wandered off with the drone.
      </p>
      <Link href="/" className={styles.home}>
        Back to the start →
      </Link>
    </main>
  );
}
