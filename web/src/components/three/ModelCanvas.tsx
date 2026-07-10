"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import styles from "./ModelCanvas.module.css";

interface ModelCanvasProps {
  children: React.ReactNode;
  cameraPosition?: [number, number, number];
  fov?: number;
  className?: string;
}

/**
 * Mounted as the Suspense FALLBACK inside the Canvas: it exists exactly
 * while the model's GLB is still loading, so its mount/unmount drives the
 * DOM loading indicator outside the WebGL context.
 */
function LoadSignal({ onChange }: { onChange: (loading: boolean) => void }) {
  useEffect(() => {
    onChange(true);
    return () => onChange(false);
  }, [onChange]);
  return null;
}

/**
 * Lazily mounts an R3F Canvas once it nears the viewport (so off-screen
 * sections stay idle), and — separately — gates the RENDER LOOP by
 * visibility: once mounted, a canvas that scrolls out of view flips to
 * frameloop="never" (no rendering, no useFrame work) and resumes as it
 * re-approaches. Without this every mounted canvas renders forever; with
 * six scenes that was the site's largest steady main-thread/GPU drain.
 *
 * While the section's GLB is still fetching/parsing, a soft pulsing glow
 * marks the stage as loading instead of leaving a dead-empty gap.
 */
export default function ModelCanvas({
  children,
  cameraPosition = [0, 0, 6],
  fov = 32,
  className,
}: ModelCanvasProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // mount early (one-shot): the GLB fetch/parse gets a head start
    const mountObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          mountObserver.disconnect();
        }
      },
      { rootMargin: "500px" }
    );
    mountObserver.observe(el);
    // render-loop gate (continuous): a modest margin so the loop is already
    // running by the time the canvas edge actually enters the viewport
    const activeObserver = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { rootMargin: "120px" }
    );
    activeObserver.observe(el);
    return () => {
      mountObserver.disconnect();
      activeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {mounted && (
        <>
          <div
            className={styles.loading}
            data-visible={loading}
            aria-hidden="true"
          />
          <Canvas
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            camera={{ position: cameraPosition, fov }}
            frameloop={active ? "always" : "never"}
          >
            <Suspense fallback={<LoadSignal onChange={setLoading} />}>
              {children}
            </Suspense>
          </Canvas>
        </>
      )}
    </div>
  );
}
