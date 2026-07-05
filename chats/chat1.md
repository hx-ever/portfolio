# Apple product launch design

_Started 2026-07-05 08:04 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "portfolio"
The project currently has no files except possibly dotfiles — a `list_files` on the project root would return nothing else.
Current date is now July 5, 2026
</system-info>

<default aesthetic_system_instructions>
The user has not attached a design system. If they have ALSO not attached references or art direction, and the project is empty, you must ASK the user what visual aesthetic they want. Use the questions_v2 tool to ask about preferred vibe, audience, colors, type, mood, etc. Do NOT just pick your own visual aesthetic without getting the user's aesthetic input -- this is how you get slop!

Once answered, use this guidance when creating designs:
- Choose a type pairing from web-safe set or Google Fonts. Helvetica is a good choice. Avoid hard-to-read or overly stylized fonts. Use 1-3 fonts only.
- Foreground and background: choose a color tone (warm, cool, neutral, something in-between). Use subtly-toned whites and blacks; avoid saturations above 0.02 for whites.
- Accents: choose 0-2 additional accent colors using oklch. All accents should share same chroma and lightness; vary hue.
- NEVER write out an SVG yourself that's more complicated than a square, circle, diamond, etc.
- For imagery, never hand-draw SVGs; use subtly-striped SVG placeholders instead with monospace explainers for what should be dropped there (e.g. “product shot”)

CRITICAL: ignore default aesthetic entirely if given other aesthetic instructions like reference images, design systems or guidance, or if there are files in the project already.
</default aesthetic_system_instructions>

<pasted_text name="Pasted text (27 lines)">
Design a wireframe/high-fidelity mockup for a personal portfolio website called "hxstudio," belonging to Hsu Hsin-Wei (Hank), a Design Engineer. Style: modern, clean, slightly playful — premium tech aesthetic with a warm, approachable touch (not cold/corporate).

NAVIGATION BAR
- Fixed at the top, "liquid glass" style: frosted/blurred translucent background, soft rounded pill-shaped bezel (fully rounded corners, floating with margin from the browser edges, not a hard edge-to-edge bar)
- Left: "hxstudio" logo/wordmark
- Right: three text links — "Designs," "Experience," "Contact" — evenly spaced, leading to separate pages
- Subtle shadow/glow under the glass bar to lift it off the page background

HERO SECTION (first full viewport)
- Two-column layout
- Left column: large headline "Hi, I am Hsu Hsin-Wei" with "Design Engineer" as a smaller subtitle/tagline directly beneath it, left-aligned, vertically centered in the viewport
- Right column: a cute, stylized 3D character (chibi/Q-version proportions — big head, small body) representing Hank as a young man, mid-wave gesture with one hand raised, wearing a warm, iconic smile with one eye winking. Character should feel friendly and personable, not photorealistic — think stylized/toylike 3D render
- Generous whitespace, nothing else competing for attention in this section

SCROLLING SHOWCASE SECTIONS (5 total, stacked below hero)
- Each section is exactly one full viewport height
- Each showcase features one 3D model (representing a specific design/portfolio project) as the dominant visual element, paired with supporting text (project title, short description, maybe a tag/category label)
- Design each of the 5 sections with a distinct but harmonious layout variation (e.g. alternate model left/right, vary text placement) so the scroll feels varied but still part of one cohesive system
- Indicate in annotations that each 3D model should visually transform, rotate, or shift pose as the user scrolls through its section — i.e. the model is scroll-animated, not static

OVERALL MOTION/FEEL (annotate this as design intent even though it's a static mockup)
- The whole page should read as one continuous, uninterrupted scroll experience — no jarring hard cuts between sections; suggest smooth cross-fades or continuous background/gradient threading through all sections to reinforce unity
- Note that transitions between hero and showcase sections, and between each showcase, should feel seamless and buttery — like one continuous piece of motion rather than five separate "slides"

DELIVERABLE
- Provide wireframe/mockup frames for: (1) the hero section, (2) one representative showcase section fully designed, (3) a scaled-down view of all 5 showcase sections in sequence to show overall flow and rhythm
- Include brief annotations next to the 3D-model placeholders describing what the intended animation/behavior is, since that can't be captured in a static frame
</pasted_text>

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context — they define how you work. Use them. -->
<attached-skill name="Design Components">
This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content with the `dc_write`, `dc_html_str_replace`, `dc_js_str_replace`, and `dc_set_props` tools (not `write_file`; `str_replace_edit` works but won't stream); template edits stream into the live preview as you type.
</attached-skill>


<system-reminder>Auto-injected reminder (ignore if not relevant): do not recreate copyrighted or branded UI unless the user's email domain matches that company. Create original designs instead.</system-reminder>

## Assistant

_[tool: read_skill_prompt]_

_[tool: set_project_title]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

Mockup ready — three frames on a pannable canvas:

- **1a** Hero: liquid-glass pill nav, headline + "Design Engineer" tagline, chibi-Hank 3D placeholder with wave/wink/idle-loop annotation
- **1b** Showcase 01 "Lumen" fully designed, with a scroll-scrub ruler (0% → 55% light-on → 100%) and section dot rail
- **1c** All 6 viewports in sequence with per-section motion notes and the whole-page motion-intent card — background hue threads continuously to show the seamless scroll

Tweaks: toggle annotations off for a clean mockup, and swap the accent color. Striped shapes are placeholders for the real 3D renders — send actual models/renders when you have them.

## User

look at current 5 years of New Product Launch Event from Apple company, make sure the color topic align with the Apple product slides, more of slight darker tone but use vibrant color to highlight key points

## Assistant

_[tool: dc_write]_

_[tool: web_search]_

_[tool: ready_for_verification]_

## User

Check didn’t complete

## Assistant

