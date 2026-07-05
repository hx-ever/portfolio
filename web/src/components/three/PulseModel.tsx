"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import SceneLights from "./SceneLights";

const ACCENT = "#0A84FF";
const CARD_COUNT = 4;

export default function PulseModel({ progress }: { progress: number }) {
  const ring = useRef<THREE.Group>(null);
  const cards = useRef<THREE.Group>(null);

  const cardAngles = useMemo(
    () => Array.from({ length: CARD_COUNT }, (_, i) => (i / CARD_COUNT) * Math.PI * 2),
    []
  );

  useFrame(() => {
    if (ring.current) {
      ring.current.rotation.y = progress * Math.PI * 2;
      ring.current.rotation.x = THREE.MathUtils.lerp(0.15, -0.1, progress);
    }
    if (cards.current) {
      const reveal = THREE.MathUtils.smoothstep(progress, 0.15, 0.55);
      cards.current.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = reveal * 0.85;
        const angle = cardAngles[i] + progress * Math.PI * 0.6;
        mesh.position.set(Math.cos(angle) * 1.3, Math.sin(angle * 0.7) * 0.4, Math.sin(angle) * 1.3 - 0.6);
        mesh.lookAt(0, 0, 2);
      });
    }
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.9} />
      <group ref={ring}>
        <mesh>
          <torusGeometry args={[0.55, 0.16, 32, 64]} />
          <meshStandardMaterial color="#e9e5db" roughness={0.35} metalness={0.55} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.018, 8, 64]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.4} />
        </mesh>
      </group>
      <group ref={cards}>
        {cardAngles.map((_, i) => (
          <mesh key={i}>
            <planeGeometry args={[0.5, 0.32]} />
            <meshStandardMaterial
              color="#16161a"
              emissive={ACCENT}
              emissiveIntensity={0.25}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}
