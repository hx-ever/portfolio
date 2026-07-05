"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { matte } from "./materials";
import SceneLights from "./SceneLights";

const ACCENT = "#FF9F0A";

export default function LumenModel({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null);
  const bulb = useRef<THREE.Mesh>(null);
  const bulbLight = useRef<THREE.PointLight>(null);

  useFrame(() => {
    if (group.current) {
      const targetY = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-30, 18, progress));
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.08);
    }
    // light blooms on at 55% of section scroll
    const bloom = THREE.MathUtils.smoothstep(progress, 0.48, 0.62);
    const mat = bulb.current?.material as THREE.MeshStandardMaterial | undefined;
    if (mat) mat.emissiveIntensity = THREE.MathUtils.lerp(0, 2.6, bloom);
    if (bulbLight.current) bulbLight.current.intensity = THREE.MathUtils.lerp(0, 3.2, bloom);
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.5} />
      <group ref={group}>
        {/* base */}
        <mesh position={[0, -1.15, 0]}>
          <cylinderGeometry args={[0.62, 0.68, 0.2, 32]} />
          <meshStandardMaterial {...matte} />
        </mesh>
        {/* stem */}
        <mesh position={[0.12, -0.35, 0]} rotation={[0, 0, THREE.MathUtils.degToRad(-10)]}>
          <cylinderGeometry args={[0.06, 0.06, 1.6, 16]} />
          <meshStandardMaterial {...matte} />
        </mesh>
        {/* shade */}
        <mesh position={[0.35, 0.62, 0]} rotation={[0, 0, THREE.MathUtils.degToRad(-10)]}>
          <cylinderGeometry args={[0.28, 0.46, 0.5, 32, 1, true]} />
          <meshStandardMaterial {...matte} side={THREE.DoubleSide} />
        </mesh>
        {/* bulb */}
        <mesh ref={bulb} position={[0.35, 0.5, 0]}>
          <sphereGeometry args={[0.16, 24, 24]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0} roughness={0.3} />
        </mesh>
        <pointLight ref={bulbLight} position={[0.35, 0.5, 0]} color={ACCENT} intensity={0} distance={6} decay={2} />
      </group>
    </>
  );
}
