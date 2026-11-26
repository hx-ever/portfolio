"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import type ModelCanvasRenderer from "./ModelCanvasRenderer";
import styles from "./ModelCanvas.module.css";

export type ModelLoader<Props extends object> = () => Promise<{ default: ComponentType<Props> }>;

interface ModelCanvasProps<Props extends object> {
  loadModel: ModelLoader<Props>;
  modelProps: Props;
  cameraPosition?: [number, number, number];
  fov?: number;
  className?: string;
}

/** Load the renderer and scene together near the viewport. */
export default function ModelCanvas<Props extends object>({
  loadModel,
  modelProps,
  cameraPosition = [0, 0, 6],
  fov = 32,
  className,
}: ModelCanvasProps<Props>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<{
    Renderer: typeof ModelCanvasRenderer;
    Model: ComponentType<Props>;
  } | null>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let disposed = false;
    const mountObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        mountObserver.disconnect();
        setLoading(true);
        // Resolve both modules before mounting the canvas so there is no
        // second loading boundary between the renderer and the model.
        Promise.all([import("./ModelCanvasRenderer"), loadModel()])
          .then(([renderer, model]) => {
            if (!disposed) setScene({ Renderer: renderer.default, Model: model.default });
          })
          .catch((error: unknown) => {
            if (disposed) return;
            setLoading(false);
            console.error("The 3D scene could not load.", error);
          });
      },
      { rootMargin: "72px 0px" },
    );
    mountObserver.observe(el);

    const activeObserver = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { rootMargin: "120px" },
    );
    activeObserver.observe(el);

    return () => {
      disposed = true;
      mountObserver.disconnect();
      activeObserver.disconnect();
    };
  }, [loadModel]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {scene ? (
        <scene.Renderer active={active} cameraPosition={cameraPosition} fov={fov}>
          <scene.Model {...modelProps} />
        </scene.Renderer>
      ) : loading ? (
        <div className={styles.loading} data-visible="true" aria-hidden="true" />
      ) : null}
    </div>
  );
}
