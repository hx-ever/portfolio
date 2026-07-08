"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { matteDark } from "./materials";
import SceneLights from "./SceneLights";

const ACCENT = "#30D158";

function Temple({ side, unfold }: { side: "left" | "right"; unfold: number }) {
  const group = useRef<THREE.Group>(null);
  const sign = side === "right" ? 1 : -1;

  useFrame(() => {
    if (!group.current) return;
    const folded = THREE.MathUtils.degToRad(78);
    const open = THREE.MathUtils.degToRad(8);
    group.current.rotation.y = sign * THREE.MathUtils.lerp(folded, open, unfold);
  });

  return (
    <group ref={group} position={[sign * 0.62, 0, 0]}>
      <mesh position={[sign * 0.4, 0, -0.02]}>
        <boxGeometry args={[0.8, 0.05, 0.05]} />
        <meshStandardMaterial {...matteDark} />
      </mesh>
    </group>
  );
}

export default function WayfarerModel({ progress }: { progress: number }) {
  const hudRef = useRef<THREE.Mesh>(null);
  const unfold = THREE.MathUtils.smoothstep(progress, 0.02, 0.32);
  const hudFade = THREE.MathUtils.smoothstep(progress, 0.3, 0.6);

  useFrame(() => {
    if (hudRef.current) {
      const mat = hudRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = hudFade * 0.8;
    }
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.8} />
      <group rotation={[0, 0, 0]}>
        {/* lens rims */}
        {[-1, 1].map((sign) => (
          <mesh key={sign} position={[sign * 0.42, 0, 0]}>
            <torusGeometry args={[0.34, 0.05, 16, 40]} />
            <meshStandardMaterial {...matteDark} />
          </mesh>
        ))}
        {/* lenses */}
        {[-1, 1].map((sign) => (
          <mesh key={`lens-${sign}`} position={[sign * 0.42, 0, 0.01]}>
            <circleGeometry args={[0.32, 32]} />
            <meshStandardMaterial color="#0b1114" roughness={0.2} metalness={0.4} />
          </mesh>
        ))}
        {/* HUD readout on the right lens */}
        <mesh ref={hudRef} position={[0.42, 0.02, 0.03]}>
          <planeGeometry args={[0.4, 0.24]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0} />
        </mesh>
        {/* bridge */}
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.16, 0.04, 0.04]} />
          <meshStandardMaterial {...matteDark} />
        </mesh>
        <Temple side="left" unfold={unfold} />
        <Temple side="right" unfold={unfold} />
      </group>
    </>
  );
}
