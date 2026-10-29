#!/usr/bin/env python3
"""build_assets.py — pack the portfolio's own assets into gen/assets.js for the film's file:// composition.

  python3 build_assets.py

Chrome blocks fetch() under file://, which is how render.py opens the comp, so every binary the comp needs is
inlined: the five product GLBs and the h logo from web/public, the site's fonts (copied from the Next dev build into
assets/fonts), and the three PCB layouts as SVG text. Writes gen/assets.js → window.ASSETS.
"""
import base64, json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent / "web" / "public"
GLBS = ["auraeyez", "buggy", "hxkeysair", "corelink", "arx"]
SVGS = ["auraeyez-pcb-top", "buggy-pcb-top", "hxkeysair-pcb-top", "hankhsu_logo_icon"]
FONTS = {
    "display": "BricolageGrotesque-200_800.woff2",
    "mono": "IBMPlexMono-500.woff2",
    "mono6": "IBMPlexMono-600.woff2",
    "body": "InstrumentSans-400_700.woff2",
}


def b64(p):
    return base64.b64encode(p.read_bytes()).decode()


def main():
    out = HERE / "gen"
    out.mkdir(exist_ok=True)
    assets = {
        "glb": {n: b64(PUB / f"{n}.glb") for n in GLBS},
        "svg": {n: (PUB / f"{n}.svg").read_text() for n in SVGS},
        "font": {k: b64(HERE / "assets" / "fonts" / f) for k, f in FONTS.items()},
    }
    (out / "assets.js").write_text("window.ASSETS = " + json.dumps(assets) + ";\n")
    print("wrote", out / "assets.js", f"{(out / 'assets.js').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
