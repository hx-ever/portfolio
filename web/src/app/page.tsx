import Hero from "@/components/Hero";
import Showcase from "@/components/Showcase";
import DotRail from "@/components/DotRail";
import ModelPrefetcher from "@/components/three/ModelPrefetcher";
import { SHOWCASES } from "@/lib/sections";

export default function Home() {
  return (
    <>
      <ModelPrefetcher />
      <DotRail />
      <main>
        <Hero />
        {SHOWCASES.map((section) => (
          <Showcase key={section.id} section={section} />
        ))}
      </main>
    </>
  );
}
