#!/usr/bin/env python3
"""score.py — the sound of "one copper trace", built from the comp's own events and curves.

  python3 dump_events.py && python3 score.py      # → out/sfx.wav (48 kHz stereo)

Everything is synthesised here (no samples, no licensed music): the action score on the onetake palette — the
current as a hum and a speed-driven zip, a struck note per board as it lights (one chord built across the film),
rises, the buggy's motor, keycaps, props, landings — and a restrained bed in D that sits under it, drops out for
the hold before the finale and resolves on the closing hit. Times and pans come from out/events.json; nothing is
retyped from the comp.
"""
import json, os, sys, wave
import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".claude", "skills", "onetake", "scripts"))
from sfx_palette import SR, Score, air, glass, wood, sub, bubble, lp, hp, bp, sat, impulse  # noqa: E402

DUR = 15.0
rng = np.random.default_rng(11)
D = json.load(open(os.path.join(HERE, "out", "events.json")))
EV, CV = D["events"], D["curves"]


def ev(name, who=None, i=0):
    hits = [e for e in EV if e["name"] == name and (who is None or e["who"] == who)]
    return hits[i]


def curve(key):
    """a 240 Hz curve from the comp, resampled to audio rate"""
    c = np.asarray(CV[key], float)
    return np.interp(np.arange(int(SR * DUR)) / SR, np.arange(len(c)) / CV["rate"], c)


s = Score(dur=DUR, T60=1.2)
place = s.place
NOTE = {"A3": 220.0, "D4": 293.66, "F#4": 369.99, "A4": 440.0, "B4": 493.88, "D5": 587.33, "E5": 659.25, "F#5": 739.99, "A5": 880.0}

# ── 1 · the current: a hum while a trace is live, a bright zip that follows its speed on screen ─────────────
n = int(SR * DUR)
spd = curve("current")
live = np.clip(curve("heads"), 0, 1)
live = signal.filtfilt(*signal.butter(1, 18 / (SR / 2)), live)
zipe = np.clip(spd / 4200.0, 0, 1.3) ** 0.85
zipe = signal.filtfilt(*signal.butter(1, 30 / (SR / 2)), zipe)
pan = curve("pan") * 0.6
noise = rng.standard_normal(n)
zipsig = bp(hp(noise, 1800), 4200, 0.7) * zipe * 0.55
t = np.arange(n) / SR
hum = (np.sin(2 * np.pi * 110 * t + 0.4 * np.sin(2 * np.pi * 3.1 * t)) * 0.6 + np.sin(2 * np.pi * 220 * t) * 0.3
       + np.sin(2 * np.pi * 330.5 * t) * 0.12) * live * (0.35 + 0.65 * np.clip(zipe, 0, 1))
cur = lp(hum * 0.16 + zipsig, 9000)
L, R = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
s.dry[:n, 0] += cur * L * 0.5; s.dry[:n, 1] += cur * R * 0.5
s.wet[:n, 0] += cur * L * 0.12; s.wet[:n, 1] += cur * R * 0.12

# ── 2 · the pad: lights, and the trace leaves it ─────────────────────────────────────────────────────────────
e = ev("pad"); place(glass(NOTE["D5"], 1.4, 0.55), e["t"], 0.22, 0.0, 0.5); place(sub(55, 0.6), e["t"], 0.16, 0.0, 0.3)
for e in [x for x in EV if x["name"] == "shoot"]:
    place(air(0.5, 300, 3400, 1.3, 0.3), e["t"] - 0.02, 0.24, e["pan"] * 0.5, 0.45, pan_to=e["pan"] * 0.6 - 0.2)

# ── 3 · each board lights: one note of a chord that builds across the film ───────────────────────────────────
chord = {"aur": "A4", "lr": "B4", "hxk": "D5", "cl": "E5", "arx": "F#5", "logo": "A5"}
for e in EV:
    if e["name"] in ("arrive", "hit"):
        f = NOTE[chord[e["who"]]]
        place(glass(f, 1.5, 0.6), e["t"], 0.2, e["pan"] * 0.6, 0.55)
        place(bubble(f * 2, 0.12), e["t"] + 0.005, 0.05, e["pan"] * 0.6, 0.3)

# ── 4 · rises: a breath up through the board, a felt settle ──────────────────────────────────────────────────
for e in [x for x in EV if x["name"] == "rise"]:
    heavy = e["who"] == "lr"
    place(air(0.5 if heavy else 0.4, 160, 1300, 1.2, 0.65), e["t"] - 0.05, 0.22, e["pan"] * 0.6, 0.45)
    place(sub(52 if heavy else 74, 0.5), e["t"] + (0.32 if heavy else 0.22), 0.2 if heavy else 0.13, e["pan"] * 0.6, 0.3)
for who in ("hxk", "cl", "arx"):
    e = ev("hit", who); place(sub(68, 0.4), e["t"] + 0.06, 0.2, e["pan"] * 0.6, 0.25); place(air(0.25, 400, 2400, 1.4, 0.4), e["t"], 0.12, e["pan"] * 0.6, 0.4)

# ── 5 · AuraEyez wakes: the screen flickers on, the eyes open, one blink, a glance ─────────────────────────
e = ev("boot"); [place(wood(1500 + 300 * k, 0.03), e["t"] + 0.075 * k, 0.05, e["pan"] * 0.6, 0.2) for k in range(3)]
e = ev("eyes"); place(bubble(640, 0.22), e["t"], 0.13, e["pan"] * 0.6, 0.35)
e = ev("blink"); place(bubble(1250, 0.07), e["t"] + 0.06, 0.05, e["pan"] * 0.6, 0.2)
e = ev("glance"); place(air(0.18, 2500, 900, 1.6, 0.3), e["t"], 0.06, e["pan"] * 0.6, 0.3)

# ── 6 · the buggy: motor pitch follows its speed; brakes, stops ─────────────────────────────────────────────
dv = curve("drive"); amp = np.clip(dv / 480, 0, 1)
amp = signal.filtfilt(*signal.butter(1, 12 / (SR / 2)), amp)
ph = np.cumsum(2 * np.pi * (70 + dv * 0.42) / SR)
motor = (signal.sawtooth(ph) * 0.5 + np.sin(3 * ph) * 0.25 + bp(rng.standard_normal(n), 1800, 2) * 0.15) * amp
motor = lp(motor, 1600) * 0.11
p0, p1 = ev("drive")["pan"], ev("stop")["pan"]
mp = np.clip((t - ev("drive")["t"]) / max(0.1, ev("stop")["t"] - ev("drive")["t"]), 0, 1) * (p1 - p0) * 0.6 + p0 * 0.6
s.dry[:n, 0] += motor * np.sqrt(0.5 * (1 - mp)); s.dry[:n, 1] += motor * np.sqrt(0.5 * (1 + mp))
s.wet[:n, 0] += motor * 0.15; s.wet[:n, 1] += motor * 0.15
e = ev("brake"); place(air(0.42, 2600, 700, 2.2, 0.25), e["t"], 0.1, e["pan"] * 0.6, 0.3)
e = ev("stop"); place(sub(58, 0.45), e["t"], 0.22, e["pan"] * 0.6, 0.3); place(wood(130, 0.1), e["t"] + 0.01, 0.16, e["pan"] * 0.6, 0.25)
e = ev("bus"); place(air(0.65, 220, 4200, 1.2, 0.25), e["t"], 0.26, e["pan"] * 0.6, 0.5, pan_to=-0.5)

# ── 7 · the burst: keycaps seat in a wave, the hub's link pulse, the drone's props and landing ──────────────
e = ev("caps")
for k in range(9):
    if rng.uniform() < 0.25: continue
    place(wood(1700 + rng.uniform(-300, 400), 0.035), e["t"] + k * 0.021 + rng.uniform(0, 0.008), 0.05 * rng.uniform(0.7, 1.3), e["pan"] * 0.6, 0.18)
e = ev("hit", "cl"); place(air(0.8, 900, 240, 1.0, 0.15), e["t"] + 0.12, 0.1, e["pan"] * 0.6, 0.6)
e = ev("hit", "arx"); tt = np.arange(int(SR * 1.3)) / SR
env = np.clip(tt / 0.12, 0, 1) * np.where(tt < 0.72, 1, np.clip(1 - (tt - 0.72) / 0.5, 0, 1)) ** 2
props = bp(rng.standard_normal(len(tt)), 520, 1.2) * (0.6 + 0.4 * np.sin(2 * np.pi * 21 * tt)) * env
place(props / (np.abs(props).max() + 1e-9), e["t"] + 0.06, 0.1, e["pan"] * 0.6, 0.25)
e = ev("land"); place(sub(80, 0.32), e["t"], 0.16, e["pan"] * 0.6, 0.25); place(wood(260, 0.06), e["t"], 0.1, e["pan"] * 0.6, 0.2)

# ── 8 · coming home: the logo, the wordmark, and the pad again — the same note it started on ────────────────
e = ev("arrive", "logo"); place(sub(49, 1.0), e["t"], 0.2, e["pan"] * 0.6, 0.4)
e = ev("word"); place(air(0.7, 220, 2600, 1.2, 0.7), e["t"], 0.16, -0.3, 0.55, pan_to=0.4)
e = ev("close")
place(glass(NOTE["D5"], 2.4, 0.55), e["t"], 0.3, e["pan"] * 0.5, 0.65)
place(glass(NOTE["A4"], 2.4, 0.4), e["t"] + 0.012, 0.16, e["pan"] * 0.3, 0.65)
place(sub(46, 1.6), e["t"], 0.32, 0.0, 0.45)
e = ev("tag"); place(wood(2100, 0.03), e["t"], 0.04, 0.2, 0.2)


# ── the bed: soft pads in D, a quiet pulse while things move, out for the hold, resolving on the close ─────
def pad(freqs, t0, t1, gain, attack=0.5, release=0.8, cutoff=1800):
    a, b = int(t0 * SR), int(min(DUR, t1 + release) * SR)
    tt = np.arange(b - a) / SR
    x = np.zeros(b - a)
    for f in freqs:
        for det in (-0.35, 0.0, 0.35):
            x += signal.sawtooth(2 * np.pi * f * (1 + det / 100) * tt + rng.uniform(0, 6.28)) / (3 * len(freqs))
    x = lp(lp(x, cutoff), cutoff)
    env = np.clip(tt / attack, 0, 1) * np.clip(((t1 - t0) + release - tt) / release, 0, 1)
    return a, x * env * gain


def pluck(f, t0, gain, dur=0.35):
    tt = np.arange(int(SR * dur)) / SR
    x = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 11)
    return int(t0 * SR), lp(x, 2500) * gain


bed = np.zeros((int(SR * (DUR + 2)), 2))
Dadd9, G, Bm, Asus = [146.83, 220.0, 329.63, 369.99], [196.0, 246.94, 293.66, 369.99], [123.47, 246.94, 293.66, 369.99], [110.0, 220.0, 293.66, 329.63]
hold0 = ev("land")["t"] + 0.3
sections = [(Dadd9, 0.6, 4.1, 0.05), (G, 4.1, 6.0, 0.055), (Bm, 6.0, 7.45, 0.06), (Asus, 7.45, hold0, 0.065),
            (Asus, ev("shoot", i=2)["t"], ev("close")["t"], 0.05), ([146.83, 220.0, 293.66, 369.99, 440.0], ev("close")["t"], DUR - 0.9, 0.06)]
for chordf, t0, t1, g in sections:
    a, x = pad(chordf, t0, t1, g, attack=0.35 if t0 > 1 else 0.9, release=0.25 if abs(t1 - hold0) < 0.01 else 0.9)
    bed[a:a + len(x), 0] += x; bed[a:a + len(x), 1] += x * 0.97
arp = [293.66, 369.99, 440.0, 587.33]
step = 0.25
k = 0
tq = 4.1
while tq < hold0 - 0.2:
    f = arp[k % 4] * (1 if tq < 6.0 else 0.84 if tq < 7.45 else 0.75 * 1.0)
    a, x = pluck(f, tq, 0.03 * (0.8 + 0.4 * ((k % 4) == 0)))
    panp = 0.25 * (1 if k % 2 else -1)
    bed[a:a + len(x), 0] += x * np.sqrt(0.5 * (1 - panp)); bed[a:a + len(x), 1] += x * np.sqrt(0.5 * (1 + panp))
    tq += step; k += 1

# ── mix and master ───────────────────────────────────────────────────────────────────────────────────────────
ir = impulse(1.2)
sfx_rev = np.stack([signal.fftconvolve(s.wet[:, c], ir[:, c])[:len(s.dry)] for c in (0, 1)], 1)
bed_rev = np.stack([signal.fftconvolve(bed[:, c] * 0.35, ir[:, c])[:len(bed)] for c in (0, 1)], 1)
m = s.dry + sfx_rev * 0.9 + bed * 0.8 + bed_rev * 0.6
m = np.stack([hp(m[:, c], 35) for c in (0, 1)], 1)[:int(SR * DUR)]
fade = np.clip((DUR - np.arange(len(m)) / SR) / 0.6, 0, 1); m *= fade[:, None]
m = sat(m / (np.abs(m).max() + 1e-9) * 0.92, 1.25)
m = m / np.abs(m).max() * 10 ** (-4.5 / 20)
out = os.path.join(HERE, "out", "sfx.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((m * 32767).astype(np.int16).tobytes())
rms = lambda a, b: 20 * np.log10(np.sqrt(np.mean(m[int(a * SR):int(b * SR)] ** 2)) + 1e-9)
print("wrote", out, "| rms dB: open", round(rms(0, 0.7), 1), "burst", round(rms(7.4, 9.0), 1), "hold", round(rms(hold0 + 0.4, ev('shoot', i=2)['t']), 1), "end", round(rms(13.5, 15), 1))
