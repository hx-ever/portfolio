"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import styles from "./ModelCanvas.module.css";

interface ModelCanvasRendererProps {
  active: boolean;
  cameraPosition: [number, number, number];
  fov: number;
  children: ReactNode;
}

function LoadSignal({ onChange }: { onChange: (loading: boolean) => void }) {
  useEffect(() => {
    onChange(true);
    return () => onChange(false);
  }, [onChange]);
  return null;
}

export default function ModelCanvasRenderer({
  active,
  cameraPosition,
  fov,
  children,
}: ModelCanvasRendererProps) {
  const [loading, setLoading] = useState(false);

  return (
    <>
      <div className={styles.loading} data-visible={loading} aria-hidden="true" />
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: cameraPosition, fov }}
        frameloop={active ? "always" : "never"}
        style={{ opacity: loading ? 0 : 1, transition: "opacity 400ms ease" }}
      >
        <Suspense fallback={<LoadSignal onChange={setLoading} />}>{children}</Suspense>
      </Canvas>
    </>
  );
}
