import Hero from "@/components/Hero";
import Showcase from "@/components/Showcase";
import DotRail from "@/components/DotRail";
import { SHOWCASES } from "@/lib/sections";

export default function Home() {
  return (
    <>
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
