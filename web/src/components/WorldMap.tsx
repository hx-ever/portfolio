"use client";

import { useEffect, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { MultiPolygon, Polygon } from "geojson";
import worldData from "world-atlas/land-110m.json";
import styles from "./WorldMap.module.css";

// Equirectangular crop: full longitude range, Antarctica trimmed.
const LAT_TOP = 85;
const LAT_BOTTOM = -58;
const ASPECT = (LAT_TOP - LAT_BOTTOM) / 360; // height = width * ASPECT

const SPACING = 3.5; // px between dot centers — fine enough for small islands
const MASK_SCALE = 2; // rasterize the landmass mask at 2x for narrow features
const SIGMA = 70; // Gaussian falloff width for the cursor glow (px)
const GAUSS_K = 1 / (2 * SIGMA * SIGMA);
const LOC_RADIUS_FRAC = 0.009; // highlight cluster radius as fraction of width
const PULSE_MS = 4000; // breathing period for highlighted clusters

const DIM = { r: 148, g: 160, b: 178 }; // resting dot tint
// Highlight tones — the site signature (copper) and a deeper copper, so the
// map's active clusters stay in the single chrome family. (= SIGNATURE)
const SIG = { r: 216, g: 158, b: 100 }; // #D89E64 — signature copper
const SIG_DEEP = { r: 198, g: 122, b: 66 }; // #C67A42 — deeper copper for cluster depth

const LOCATIONS = [
  { label: "SINGAPORE", lon: 103.82, lat: 1.35, dx: 16, dy: 16 },
  { label: "TAIWAN", lon: 121.0, lat: 23.7, dx: 20, dy: 14 },
  { label: "SHANGHAI", lon: 121.47, lat: 31.23, dx: 14, dy: -18 },
];

const STEPS = 24; // intensity quantization for the sprite atlas
const SPRITE = 8; // sprite box size in css px
const HALF = SPRITE / 2;
// Beyond this distance the Gaussian is < 1/(2·STEPS) — it quantizes to
// sprite index 0 (invisible) — so treating it as exactly zero is lossless
// and lets far dots skip the falloff math entirely.
const CUTOFF = 200;
// Punch-out radius: covers the largest dot (1.6px) but stays clear of the
// nearest neighbour's resting pixels (3.5px spacing - 1.05px radius = 2.45px).
const PUNCH_R = 2;

interface Dot {
  x: number;
  y: number;
  locG: number; // 0..1 membership in a highlighted location cluster
  cur: number; // eased intensity
  idx: number; // sprite index this frame (transient, set during draw)
}

interface LabelPos {
  label: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** anchor the text's right edge instead, so it grows leftward — used when
      the default leftward-growing box would overflow the map's right edge */
  flip: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const mix = (
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number
) => ({ r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t) });

const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r.toFixed(0)}, ${c.g.toFixed(0)}, ${c.b.toFixed(0)}, ${a.toFixed(3)})`;

// Base dots: always-visible muted tint at rest, ramping to the copper accent.
// The rest alpha keeps the whole map clearly readable with no cursor at all.
const BASE_LUT = Array.from({ length: STEPS + 1 }, (_, i) => {
  const t = i / STEPS;
  return rgba(mix(DIM, SIG, t), 0.24 + 0.7 * t);
});
// Highlight clusters: a copper blend within the signature family, never dim.
const LOC_LUT = Array.from({ length: STEPS + 1 }, (_, i) => {
  const t = i / STEPS;
  return rgba(mix(mix(SIG, SIG_DEEP, 0.4), mix(SIG, SIG_DEEP, 0.15), t), 0.3 + 0.7 * t);
});

const dotRadius = (t: number) => 1.05 + 0.55 * t;

// Cosine-squared falloff for the static location clusters.
const clusterFalloff = (dist: number, radius: number) => {
  const u = Math.min(dist / radius, 1);
  const c = Math.cos((u * Math.PI) / 2);
  return c * c;
};

export default function WorldMap() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [labels, setLabels] = useState<LabelPos[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const topo = worldData as unknown as Topology;
    const land = feature(topo, topo.objects.land as GeometryCollection).features[0]
      .geometry as MultiPolygon | Polygon;
    const polygons = land.type === "MultiPolygon" ? land.coordinates : [land.coordinates];

    let dots: Dot[] = [];
    let locPoints: { x: number; y: number; r: number }[] = [];
    let sprites: HTMLCanvasElement[][] = [];
    let base: HTMLCanvasElement | null = null; // every dot at rest, prerendered
    let punch: HTMLCanvasElement | null = null; // destination-out hole for redrawn dots
    const actives: Dot[] = []; // per-frame redraw list (reused buffer)
    let W = 0;
    let H = 0;
    const cursor = { x: -1e6, y: -1e6 };
    let frame = 0;
    let running = false;
    let needsFrame = true; // draw at least once even before any interaction

    const project = (lon: number, lat: number) => ({
      x: ((lon + 180) / 360) * W,
      y: ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H,
    });

    // Pre-render one dot sprite per palette and intensity step; per-frame
    // drawing is then pure blits, which keeps the finer grid (~3x the old
    // dot count) comfortably within frame budget.
    const buildSprites = (dpr: number) => {
      sprites = [BASE_LUT, LOC_LUT].map((lut) =>
        lut.map((color, i) => {
          const c = document.createElement("canvas");
          c.width = c.height = Math.ceil(SPRITE * dpr);
          const sctx = c.getContext("2d")!;
          sctx.scale(dpr, dpr);
          sctx.fillStyle = color;
          sctx.beginPath();
          sctx.arc(SPRITE / 2, SPRITE / 2, dotRadius(i / STEPS), 0, Math.PI * 2);
          sctx.fill();
          return c;
        })
      );
      // opaque disc used with destination-out to erase a dot's resting
      // pixels from the blitted base before its brighter sprite is drawn
      punch = document.createElement("canvas");
      punch.width = punch.height = Math.ceil(SPRITE * dpr);
      const pctx = punch.getContext("2d")!;
      pctx.scale(dpr, dpr);
      pctx.fillStyle = "#000";
      pctx.beginPath();
      pctx.arc(SPRITE / 2, SPRITE / 2, PUNCH_R, 0, Math.PI * 2);
      pctx.fill();
    };

    const build = () => {
      W = wrap.clientWidth;
      H = Math.round(W * ASPECT);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildSprites(dpr);

      // Rasterize the landmass vectors at 2x resolution so narrow features
      // (straits, small islands) survive, then sample the grid for dot sites.
      const mask = document.createElement("canvas");
      mask.width = W * MASK_SCALE;
      mask.height = H * MASK_SCALE;
      const mctx = mask.getContext("2d");
      if (!mctx) return;
      mctx.scale(MASK_SCALE, MASK_SCALE);
      mctx.fillStyle = "#fff";
      mctx.beginPath();
      for (const polygon of polygons) {
        for (const ring of polygon) {
          // Unwrap longitudes so antimeridian-crossing rings (Chukotka,
          // Fiji) don't draw a chord across the whole map; stamping the
          // path at ±360° puts the overflowing part back on the far side.
          let prev = ring[0][0];
          const unwrapped = ring.map(([lon, lat]) => {
            while (lon - prev > 180) lon -= 360;
            while (lon - prev < -180) lon += 360;
            prev = lon;
            return [lon, lat] as [number, number];
          });
          for (const shift of [-360, 0, 360]) {
            unwrapped.forEach(([lon, lat], i) => {
              const p = project(lon + shift, lat);
              if (i === 0) mctx.moveTo(p.x, p.y);
              else mctx.lineTo(p.x, p.y);
            });
            mctx.closePath();
          }
        }
      }
      mctx.fill();
      const pixels = mctx.getImageData(0, 0, mask.width, mask.height).data;
      const landAt = (x: number, y: number) => {
        const mx = Math.min(mask.width - 1, Math.round(x * MASK_SCALE));
        const my = Math.min(mask.height - 1, Math.round(y * MASK_SCALE));
        return pixels[(my * mask.width + mx) * 4 + 3] >= 128;
      };

      const locR = Math.max(8, W * LOC_RADIUS_FRAC);
      locPoints = LOCATIONS.map((l) => ({ ...project(l.lon, l.lat), r: locR }));

      const locWeight = (x: number, y: number) => {
        let g = 0;
        for (const p of locPoints) {
          g = Math.max(g, clusterFalloff(Math.hypot(x - p.x, y - p.y), p.r));
        }
        return g;
      };

      dots = [];
      for (let y = SPACING / 2; y < H; y += SPACING) {
        for (let x = SPACING / 2; x < W; x += SPACING) {
          if (!landAt(x, y)) continue;
          dots.push({ x, y, locG: locWeight(x, y), cur: 0, idx: 0 });
        }
      }

      // Guarantee each marked location has a visible cluster even where the
      // landmass data omits small islands (Singapore at 110m): a small
      // diamond of dots rather than a square block.
      for (const p of locPoints) {
        const near = dots.some(
          (d) => d.locG > 0.3 && Math.hypot(d.x - p.x, d.y - p.y) < p.r
        );
        if (near) continue;
        const offsets = [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        for (const [ox, oy] of offsets) {
          const x = p.x + ox * SPACING;
          const y = p.y + oy * SPACING;
          dots.push({ x, y, locG: locWeight(x, y), cur: 0, idx: 0 });
        }
      }

      // Prerender every dot at rest into the base layer: per-frame work then
      // reduces to one blit plus only the dots that currently differ from
      // rest (cluster pulse + cursor glow) instead of ~10k drawImage calls.
      base = document.createElement("canvas");
      base.width = W * dpr;
      base.height = H * dpr;
      const bctx = base.getContext("2d")!;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const dot of dots) {
        bctx.drawImage(sprites[dot.locG > 0.12 ? 1 : 0][0], dot.x - HALF, dot.y - HALF, SPRITE, SPRITE);
      }

      setLabels(
        LOCATIONS.map((l) => {
          const p = project(l.lon, l.lat);
          // ~8px per character at 10px mono + 0.18em tracking; flip labels
          // that would run past the map's right edge (they'd be clipped at
          // narrow viewports since the sites are all in east Asia)
          const flip = p.x + l.dx + l.label.length * 8 + 8 > W;
          return { label: l.label, x: p.x, y: p.y, dx: l.dx, dy: l.dy, flip };
        })
      );
      needsFrame = true;
    };

    const draw = (now: number) => {
      frame = 0;
      ctx.clearRect(0, 0, W, H);
      if (base) ctx.drawImage(base, 0, 0, W, H);

      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((now / PULSE_MS) * Math.PI * 2);
      const ease = reduced ? 1 : 0.16;
      let settled = true;

      // Pass 1 — state only: dots at rest (no cluster membership, no eased
      // residual, outside the cursor's cutoff box) are covered by the base
      // blit and skipped entirely; the rest ease toward their target and are
      // queued for redraw. This reduces per-frame draw calls from every land
      // dot (~10k) to just the animated ones.
      actives.length = 0;
      for (const dot of dots) {
        const dx = dot.x - cursor.x;
        const dy = dot.y - cursor.y;
        // Gaussian falloff of the cursor glow, with a hard cutoff box where
        // its value is already indistinguishable from zero.
        let hoverG = 0;
        if (dx < CUTOFF && dx > -CUTOFF && dy < CUTOFF && dy > -CUTOFF) {
          hoverG = Math.exp(-(dx * dx + dy * dy) * GAUSS_K);
          if (hoverG < 0.004) hoverG = 0;
        }
        if (dot.locG === 0 && dot.cur === 0 && hoverG === 0) continue; // at rest

        const target = Math.min(1, dot.locG * (0.5 + 0.3 * pulse) + hoverG);
        dot.cur += (target - dot.cur) * ease;
        if (Math.abs(target - dot.cur) > 0.004) settled = false;
        else dot.cur = target;

        dot.idx = Math.round(dot.cur * STEPS);
        if (dot.idx > 0) actives.push(dot); // idx 0 renders identically to base
      }

      // Pass 2 — erase the resting pixels under every dot about to be
      // redrawn (all punches before any sprite, so a punch can never shave
      // an already-drawn neighbour).
      if (punch) {
        ctx.globalCompositeOperation = "destination-out";
        for (const dot of actives) {
          ctx.drawImage(punch, dot.x - HALF, dot.y - HALF, SPRITE, SPRITE);
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // Tick lines from each highlighted cluster toward its label.
      ctx.strokeStyle = "rgba(160, 170, 190, 0.35)";
      ctx.lineWidth = 1;
      for (let i = 0; i < locPoints.length; i++) {
        const { x, y } = locPoints[i];
        const { dx, dy } = LOCATIONS[i];
        ctx.beginPath();
        ctx.moveTo(x + Math.sign(dx) * 5, y + Math.sign(dy) * 5);
        ctx.lineTo(x + dx - 3, y + dy - Math.sign(dy) * 2);
        ctx.stroke();
      }

      // Pass 3 — the animated dots at their current intensity.
      for (const dot of actives) {
        ctx.drawImage(sprites[dot.locG > 0.12 ? 1 : 0][dot.idx], dot.x - HALF, dot.y - HALF, SPRITE, SPRITE);
      }

      // Keep animating while visible: the pulse is continuous, and hover
      // easing may still be settling. Under reduced motion the pulse is
      // static, so stop once everything has settled.
      if (running && (!reduced || !settled || needsFrame)) {
        needsFrame = false;
        frame = requestAnimationFrame(draw);
      }
    };

    const start = () => {
      if (!frame && running) frame = requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      cursor.x = event.clientX - rect.left;
      cursor.y = event.clientY - rect.top;
      needsFrame = true;
      start();
    };
    const onPointerLeave = () => {
      cursor.x = -1e6;
      cursor.y = -1e6;
      needsFrame = true;
      start();
    };

    // Only animate while the map is on screen.
    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
      if (running) start();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });

    build();
    // Debounced rebuild: build() rasterizes the landmass mask and re-samples
    // ~10k dot sites — far too heavy to run on every intermediate tick of a
    // window drag. Rebuild once the resize settles; the canvas keeps its
    // last frame (scaled by CSS) in the meantime, so nothing flashes.
    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        build();
        start();
      }, 180);
    });
    ro.observe(wrap);
    io.observe(canvas);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      ro.disconnect();
      io.disconnect();
      window.clearTimeout(resizeTimer);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className={styles.section}>
      <div ref={wrapRef} className={styles.wrap}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        {labels.map((l) => (
          <span
            key={l.label}
            className={styles.label}
            style={{
              left: l.x + l.dx,
              top: l.y + l.dy,
              transform: l.flip ? "translate(-100%, -50%)" : undefined,
            }}
            aria-hidden="true"
          >
            {l.label}
          </span>
        ))}
      </div>
      <p className={styles.caption}>
        Open to opportunities in Singapore, Taiwan, and Shanghai.
      </p>
    </section>
  );
}
