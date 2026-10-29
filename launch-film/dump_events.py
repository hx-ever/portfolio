#!/usr/bin/env python3
"""dump_events.py — read the comp's __events() and __curves() → events.json for score.py.

  python3 dump_events.py            # writes out/events.json
"""
import asyncio, json, pathlib
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 1920, "height": 1080})).new_page()
        await pg.goto("file://" + str(HERE / "comp.html"))
        await pg.evaluate("window.__ready")
        data = {"events": await pg.evaluate("window.__events()"), "curves": await pg.evaluate("window.__curves(240)")}
        await b.close()
    out = HERE / "out" / "events.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(data))
    print("wrote", out, len(data["events"]), "events")


asyncio.run(main())
