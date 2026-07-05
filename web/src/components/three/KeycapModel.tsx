"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { matte } from "./materials";
import SceneLights from "./SceneLights";

const ACCENT = "#30D158";
const COLS = 10;
const ROWS = 4;
const GAP = 0.24;

export default function KeycapModel({ progress }: { progress: number }) {
  const instanced = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const offsets = useMemo(() => {
    const arr: { x: number; z: number; dir: THREE.Vector3 }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c - (COLS - 1) / 2) * GAP;
        const z = (r - (ROWS - 1) / 2) * GAP;
        // deterministic pseudo-variance per key so the explode direction isn't perfectly uniform
        const jitter = 0.3 + (((r * COLS + c) * 47) % 40) / 100;
        const dir = new THREE.Vector3(x, jitter, z).normalize();
        arr.push({ x, z, dir });
      }
    }
    return arr;
  }, []);

  useFrame(() => {
    if (!instanced.current) return;
    // explodes mid-section, reassembles on exit
    const explode = Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI);
    offsets.forEach((o, i) => {
      dummy.position.set(
        o.x + o.dir.x * explode * 0.5,
        o.dir.y * explode * 1.1,
        o.z + o.dir.z * explode * 0.5
      );
      dummy.rotation.set(explode * o.dir.z * 1.2, 0, -explode * o.dir.x * 1.2);
      dummy.updateMatrix();
      instanced.current!.setMatrixAt(i, dummy.matrix);
    });
    instanced.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.6} />
      {/* base plate */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[COLS * GAP + 0.2, 0.12, ROWS * GAP + 0.2]} />
        <meshStandardMaterial {...matte} />
      </mesh>
      <instancedMesh ref={instanced} args={[undefined, undefined, offsets.length]}>
        <boxGeometry args={[0.19, 0.14, 0.19]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.6} metalness={0.05} />
      </instancedMesh>
    </>
  );
}
