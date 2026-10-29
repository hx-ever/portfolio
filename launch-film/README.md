# One copper trace — a 15 s launch film for hankhsu.com

Made with the onetake skill (`.claude/skills/onetake`). One copper trace starts at the period of
"Hsu Hsin-Wei.", runs through the real PCB layouts of each build, each board rises into its product, and the
trace comes home as the h logo and the wordmark. Everything is the portfolio's own material: the five GLB
models and the h logo from `web/public`, the site's materials and accents (`web/src/components/three`,
`web/src/lib/palette.ts`), its fonts (Bricolage Grotesque, IBM Plex Mono, Instrument Sans), and the KiCad
layouts of AuraEyez, Land Rover and Hxkeys Air.

## Concept

**One element through everything.** The trace head is on screen from the first frame to the lockup; every
board it reaches lights from the entry point outwards and grows into its product. The Land Rover is a line
follower, so for one beat the product *is* the head: it drives the trace to the junction and brakes, and the
burst leaves from under it. Rules out: cards, title slides, cuts.

Look: the site's own. A near-black solder-mask board with a 20 mm via grid. Copper `#D89E64` carries the
current, and each project lights in its accent: amber, moss, teal, periwinkle, rose. The h logo keeps its
orange→yellow.

## Beat sheet

| t (s) | beat | what moves | what is still | carries into the next beat |
|---|---|---|---|---|
| 0.00–0.70 | macro on the pad | pad lights at 0.15 | camera, board | the pad: the trace leaves it |
| 0.70–1.95 | the trace shoots out | head, camera chasing it | board | the head reaches AuraEyez's layout |
| 1.95–3.30 | AuraEyez board lights, the device rises through it, screen boots, eyes open | ripple, device, eyes | — | the device, on its own board |
| 3.30–4.06 | **rest**: one blink, the eyes glance left | eyes only | camera, device | the glance points where the head goes |
| 4.06–4.84 | whip to the Land Rover board | head, camera | — | the head enters the sensor board |
| 4.84–6.04 | board lights, the buggy rises | ripple, buggy | — | the buggy |
| 6.04–7.40 | the buggy follows the line, brakes at the junction | buggy, trace under it, camera | — | the bus leaves from under the buggy |
| 7.40–9.10 | **burst**: three parallel traces race and peel off; Hxkeys Air pops (caps seat in a wave), CoreLink boots with a link pulse, Arx spins up, hops and lands | three heads, products, camera pulling back | — | the circuit |
| 9.30–10.24 | **hold**: the whole lower board, settled | nothing | everything | the fourth lane |
| 10.24–10.75 | the fourth lane races home | head, camera rising to the lockup | — | the head enters the h |
| 10.75–11.75 | the h fills, the wordmark lights left to right | reveals | camera | the current reaches the pad |
| 11.75 | the pad flashes: the loop closes on the dot it started from | pad | — | — |
| 11.85–15.00 | tagline rises; **end hold** | tagline (0.4 s) | everything | — |

Burst times come from the bus lengths at a shared speed (`T.busV`), so the hits are spaced by geometry, not by
a metronome.

## Files

| file | what |
|---|---|
| `comp.html` | the composition: `__seek(t)`, `__ready`, `__meta`, `__track`, `__motion`, `__events`, `__curves` |
| `models.js` | the five GLBs themed as on the site, with the controls the film animates (eyes, wheels, keycaps, props, dashboard) |
| `motion.js` | onetake's move library (a copy of `lib/motion.js`) |
| `build_assets.py` | packs GLBs, SVGs and fonts into `gen/assets.js` (generated, git-ignored), because `file://` blocks fetch |
| `vendor/three-entry.js` | three.js + GLTFLoader + RoomEnvironment bundled as a classic script into `vendor/three.bundle.js` |
| `dump_events.py` → `score.py` | the comp's events and curves → `out/sfx.wav`, all synthesised (no samples, no licensed music) |
| `assets/fonts/` | the site's Google Fonts (OFL), copied from the Next build |

## Rebuild

From `launch-film/`, with the onetake skill's Python requirements installed:

```bash
python3 build_assets.py
python3 dump_events.py && python3 score.py
python3 ../.claude/skills/onetake/scripts/render.py comp.html --out out/draft.mp4 --sfx out/sfx.wav
python3 ../.claude/skills/onetake/scripts/verify_promo.py out/draft.mp4 --comp comp.html
```

If `vendor/three.bundle.js` is missing, bundle it with esbuild from `web/node_modules/three`
(`esbuild vendor/three-entry.js --bundle --format=iife --minify --outfile=vendor/three.bundle.js`).
Preview in a browser with `comp.html?play`. Pin a frame with `comp.html?t=8.2&hud`.
The 4K60 final is `render.py --final` and only makes sense once the draft is accepted.
