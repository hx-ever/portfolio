#!/usr/bin/env python3
"""export.py — the deliverables from a render: MP4 with the score, a WebM for the site, and the end-card poster.

  python3 export.py out/film_v2.mp4          # → out/hxstudio-hero.mp4, out/hxstudio-hero.webm, out/hxstudio-hero-poster.png

MP4: H.264 High, yuv420p, the picture stream copied from render.py (CRF 16, +faststart), AAC 256 kbps.
WebM: VP9 (constrained quality, CRF 30) with Opus, for the hero <video> on the site.
Poster: the end card rendered straight from the comp (lossless), at 12.6 s, when the type has settled.
"""
import asyncio, pathlib, subprocess, sys
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"
POSTER_T = 12.6


def run(cmd):
    print("$", " ".join(map(str, cmd)), flush=True)
    subprocess.run(cmd, check=True)


async def poster(path):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 1920, "height": 1080})).new_page()
        await pg.goto("file://" + str(HERE / "comp.html"))
        await pg.evaluate("window.__ready")
        await pg.evaluate(f"window.__seek({POSTER_T})")
        await pg.screenshot(path=str(path), type="png")
        await b.close()


def main():
    src = pathlib.Path(sys.argv[1]).resolve()
    score = OUT / "score.wav"
    mp4, webm, png = OUT / "hxstudio-hero.mp4", OUT / "hxstudio-hero.webm", OUT / "hxstudio-hero-poster.png"
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-i", score, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
         "-shortest", "-movflags", "+faststart", mp4])
    run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-deadline", "good",
         "-cpu-used", "2", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-b:a", "160k", webm])
    asyncio.run(poster(png))
    for f in (mp4, webm, png):
        print(f, f"{f.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
