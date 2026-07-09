"use client";

export default function SceneLights({
  accent,
  accentIntensity = 1,
  level = 1,
}: {
  accent: string;
  accentIntensity?: number;
  /** overall exposure scale for this scene's lights (models with bright
   *  materials + an environment map run this below 1 to avoid washing out) */
  level?: number;
}) {
  return (
    <>
      <ambientLight intensity={0.6 * level} color="#ffffff" />
      <directionalLight position={[3, 4, 5]} intensity={0.85 * level} color="#fff7ec" />
      <directionalLight position={[-3, -2, -4]} intensity={0.2 * level} color={accent} />
      <pointLight
        position={[-2.2, -1, 2.5]}
        intensity={accentIntensity * level}
        color={accent}
        distance={8}
        decay={2}
      />
    </>
  );
}
