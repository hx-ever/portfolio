"use client";

export default function SceneLights({
  accent,
  accentIntensity = 1,
}: {
  accent: string;
  accentIntensity?: number;
}) {
  return (
    <>
      <ambientLight intensity={0.6} color="#ffffff" />
      <directionalLight position={[3, 4, 5]} intensity={0.85} color="#fff7ec" />
      <directionalLight position={[-3, -2, -4]} intensity={0.2} color={accent} />
      <pointLight position={[-2.2, -1, 2.5]} intensity={accentIntensity} color={accent} distance={8} decay={2} />
    </>
  );
}
