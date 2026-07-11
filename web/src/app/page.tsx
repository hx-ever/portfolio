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
      <main id="main-content" tabIndex={-1}>
        <Hero />
        {SHOWCASES.map((section) => (
          <Showcase key={section.id} section={section} />
        ))}
      </main>
    </>
  );
}
