"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { matte, ink } from "./materials";
import SceneLights from "./SceneLights";

const ACCENT = "#2997FF";

function Arm({ side }: { side: "left" | "right" }) {
  const group = useRef<THREE.Group>(null);
  const sign = side === "right" ? 1 : -1;

  useFrame((state) => {
    if (!group.current) return;
    if (side === "right") {
      const t = state.clock.elapsedTime;
      // wave for ~2.4s on load, then settle to a relaxed resting angle
      const envelope = THREE.MathUtils.clamp(1 - (t - 2.4) * 2, 0, 1);
      const restAngle = 0.35;
      const waveAngle = -1.9 + Math.sin(t * 7) * 0.35;
      group.current.rotation.z = -THREE.MathUtils.lerp(restAngle, waveAngle, envelope);
    } else {
      group.current.rotation.z = 0.3;
    }
  });

  return (
    <group ref={group} position={[sign * 0.5, 0.15, 0]}>
      <mesh position={[sign * 0.24, -0.16, 0.02]} rotation={[0, 0, sign * 1.15]}>
        <capsuleGeometry args={[0.13, 0.4, 4, 10]} />
        <meshStandardMaterial {...matte} />
      </mesh>
    </group>
  );
}

export default function ChibiCharacter() {
  const headGroup = useRef<THREE.Group>(null);
  const rootGroup = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const hoveredRef = useRef(false);

  useFrame((state) => {
    if (rootGroup.current) {
      rootGroup.current.position.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.06;
    }

    if (headGroup.current) {
      const targetY = THREE.MathUtils.clamp(state.pointer.x, -1, 1) * 0.35;
      const targetX = THREE.MathUtils.clamp(-state.pointer.y, -1, 1) * 0.18;
      headGroup.current.rotation.y = THREE.MathUtils.lerp(headGroup.current.rotation.y, targetY, 0.06);
      headGroup.current.rotation.x = THREE.MathUtils.lerp(headGroup.current.rotation.x, targetX, 0.06);
    }

    if (leftEye.current) {
      const target = hoveredRef.current ? 0.08 : 1;
      leftEye.current.scale.y = THREE.MathUtils.lerp(leftEye.current.scale.y, target, 0.18);
    }
    if (rightEye.current) {
      rightEye.current.scale.y = THREE.MathUtils.lerp(rightEye.current.scale.y, 1, 0.18);
    }
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={1.1} />
      <group
        ref={rootGroup}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoveredRef.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          hoveredRef.current = false;
          document.body.style.cursor = "auto";
        }}
      >
        <group ref={headGroup} position={[0, 0.47, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.62, 40, 40]} />
            <meshStandardMaterial {...matte} />
          </mesh>
          <mesh ref={leftEye} position={[-0.22, 0.04, 0.55]}>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshStandardMaterial {...ink} />
          </mesh>
          <mesh ref={rightEye} position={[0.22, 0.04, 0.55]}>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshStandardMaterial {...ink} />
          </mesh>
          <mesh position={[0, -0.18, 0.56]} rotation={[Math.PI * 0.62, 0, 0]}>
            <torusGeometry args={[0.16, 0.028, 8, 24, Math.PI]} />
            <meshStandardMaterial {...ink} />
          </mesh>
        </group>

        <mesh position={[0, -0.27, 0]}>
          <capsuleGeometry args={[0.42, 0.32, 4, 12]} />
          <meshStandardMaterial {...matte} />
        </mesh>

        <Arm side="left" />
        <Arm side="right" />
      </group>
    </>
  );
}
