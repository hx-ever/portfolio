"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { matteDark } from "./materials";
import SceneLights from "./SceneLights";

const ACCENT = "#FF375F";
const RIPPLES = 3;

export default function EchoModel({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null);
  const ripples = useRef<THREE.Group>(null);

  const ripplePhase = useMemo(() => Array.from({ length: RIPPLES }, (_, i) => i / RIPPLES), []);

  useFrame((state) => {
    if (group.current) {
      const tilt = THREE.MathUtils.lerp(0.5, 0, progress);
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, tilt, 0.08);
    }
    if (ripples.current) {
      ripples.current.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        const t = ((state.clock.elapsedTime * 0.25 + ripplePhase[i]) % 1);
        const scale = 0.55 + t * 1.1;
        mesh.scale.set(scale, scale, scale);
        mat.opacity = (1 - t) * 0.5;
      });
    }
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.8} />
      <group ref={group}>
        {/* headband */}
        <mesh rotation={[0, 0, Math.PI]} position={[0, 0.35, 0]}>
          <torusGeometry args={[0.62, 0.05, 16, 32, Math.PI]} />
          <meshStandardMaterial {...matteDark} />
        </mesh>
        {/* ear cups */}
        {[-1, 1].map((sign) => (
          <mesh key={sign} position={[sign * 0.62, -0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.3, 0.3, 0.24, 32]} />
            <meshStandardMaterial {...matteDark} />
          </mesh>
        ))}
        {[-1, 1].map((sign) => (
          <mesh key={`pad-${sign}`} position={[sign * (0.62 + (sign > 0 ? 0.12 : -0.12)), -0.1, 0]}>
            <circleGeometry args={[0.24, 32]} />
            <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.35} />
          </mesh>
        ))}
      </group>
      <group ref={ripples} position={[0, -0.1, 0.3]}>
        {ripplePhase.map((p) => (
          <mesh key={p} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.3, 0.33, 48]} />
            <meshBasicMaterial color={ACCENT} transparent opacity={0} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </>
  );
}
