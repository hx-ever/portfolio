#!/usr/bin/env python3
"""score.py — the sound of "one copper trace" v2, built from the comp's own events and curves.

  python3 dump_events.py && python3 score.py      # → out/score.wav (48 kHz stereo, −16 LUFS, ≤ −1 dBTP)

Everything is synthesised (no samples, no licensed music). The picture has to work muted; this is the bonus:
- a warm, sparse bed at 120 BPM in D that runs from the first sample to the last (no gaps, no silence), resolving on
  D when the name lands and ringing through the end card, with only the last 0.2 s decaying to about −60 dB;
- each power-on a short tonal blip on the beat, one pentatonic step higher from U1 to U5;
- the current as a soft hum and a zip that follows its speed, every whoosh low-passed at 8 kHz;
- a soft sub thump when the h ignites and a crisp click when the full stop lands.
Times and pans come from out/events.json (the comp's __events / __curves); nothing is retyped.
"""
import json, os, sys, wave
import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".claude", "skills", "onetake", "scripts"))
from sfx_palette import SR, air, glass, wood, sub, bubble, lp, hp, bp, impulse  # noqa: E402

DUR, BPM = 15.0, 120.0
BEAT = 60.0 / BPM
N = int(SR * DUR)
rng = np.random.default_rng(23)
D = json.load(open(os.path.join(HERE, "out", "events.json")))
EV, CV = D["events"], D["curves"]
t_ax = np.arange(N) / SR


def ev(name, who=None):
    return [e for e in EV if e["name"] == name and (who is None or e["who"] == who)]


def one(name, who=None):
    return ev(name, who)[0]


def curve(key):
    c = np.asarray(CV[key], float)
    return np.interp(t_ax, np.arange(len(c)) / CV["rate"], c)


class Bus:
    def __init__(self):
        self.x = np.zeros((N + SR * 2, 2))

    def place(self, sig, t, gain=1.0, pan=0.0):
        sig = np.asarray(sig, float); i0 = int(round(t * SR)); n = min(len(sig), len(self.x) - i0)
        if n <= 0: return
        self.x[i0:i0 + n, 0] += sig[:n] * gain * np.sqrt(0.5 * (1 - pan)); self.x[i0:i0 + n, 1] += sig[:n] * gain * np.sqrt(0.5 * (1 + pan))

    def add(self, stereo):
        self.x[:len(stereo)] += stereo


sfx, bed, send = Bus(), Bus(), Bus()          # send: what goes to the room


def S(sig, t, gain, pan=0.0, wet=0.3):
    sfx.place(sig, t, gain, pan); send.place(sig, t, gain * wet, pan)


NOTE = lambda n: 440.0 * 2 ** ((n - 69) / 12)   # MIDI → Hz
D2, A2, D3 = NOTE(38), NOTE(45), NOTE(50)
PENTA = [NOTE(74), NOTE(76), NOTE(78), NOTE(81), NOTE(83)]   # D5 E5 F#5 A5 B5: U1 → U5

# ── the bed ────────────────────────────────────────────────────────────────────────────────────────────────────
def pad_voice(freqs, t0, t1, gain, attack=0.6, release=1.2, cutoff=1500.0):
    a, b = int(t0 * SR), int(min(DUR + 1.5, t1 + release) * SR); tt = np.arange(b - a) / SR; x = np.zeros(b - a)
    for f in freqs:
        for det in (-0.4, 0.0, 0.4):
            ph = 2 * np.pi * f * (1 + det / 100) * tt + rng.uniform(0, 6.28)
            x += (signal.sawtooth(ph) * 0.6 + np.sin(ph) * 0.4) / (3 * len(freqs))
    x = lp(lp(x, cutoff), cutoff * 1.4)
    env = np.clip(tt / attack, 0, 1) ** 1.5 * np.clip(((t1 - t0) + release - tt) / release, 0, 1)
    return a, x * env * gain


def pulse(f, t, dur=0.42):                 # the warm sub pulse on the beat: sine + a little 2nd, soft attack
    tt = np.arange(int(SR * dur)) / SR; env = (1 - np.exp(-tt / 0.006)) * np.exp(-tt / 0.16)
    return np.sin(2 * np.pi * f * tt) * env + 0.25 * np.sin(4 * np.pi * f * tt) * env * np.exp(-tt / 0.06)


def pluck(f, dur=0.3):
    tt = np.arange(int(SR * dur)) / SR
    return lp((np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.12 * np.sin(6 * np.pi * f * tt)) * np.exp(-tt * 10), 3200)


chords = [  # (start, end, voicing) — two bars each, resolving to D for the name
    (0.0, 4.0, [D3, NOTE(57), NOTE(64), NOTE(66)]),          # Dadd9
    (4.0, 6.0, [NOTE(47), NOTE(54), NOTE(57), NOTE(62)]),    # Bm7
    (6.0, 8.0, [NOTE(43), NOTE(50), NOTE(54), NOTE(59)]),    # Gmaj7
    (8.0, 10.0, [NOTE(45), NOTE(52), NOTE(57), NOTE(62)]),   # Asus4 — the crane
    (10.0, DUR, [D3, NOTE(57), NOTE(62), NOTE(66), NOTE(69)]),  # D — the name, ringing through the end card
]
roots = {0.0: D2, 4.0: NOTE(35), 6.0: NOTE(31) * 2, 8.0: A2 / 2 * 2, 10.0: D2}
for t0, t1, v in chords:
    a, x = pad_voice(v, t0 if t0 > 0 else 0.0, t1, 0.11 if t0 < 10 else 0.12, attack=0.25 if t0 == 0 else 0.5, release=0.6 if t1 < DUR else 0.5)
    bed.x[a:a + len(x), 0] += x; bed.x[a:a + len(x), 1] += x * 0.98
    send.x[a:a + len(x), 0] += x * 0.35; send.x[a:a + len(x), 1] += x * 0.35
# sub pulse on every beat, accented on the bar, quieter in the cold open and on the end card
for k in range(int(DUR / BEAT)):
    t = k * BEAT; root = [r for s, r in sorted(roots.items()) if s <= t + 1e-6][-1]
    g = (0.21 if k % 4 == 0 else 0.14) * (0.55 if t < 1.0 else 0.7 if t >= 12.0 else 1.0)
    bed.place(pulse(root, t), t, g)
# sparse eighth-note plucks while the pulse travels (1.0–10.0), in the chord, panned gently
for k in range(int(1.0 / (BEAT / 2)), int(10.0 / (BEAT / 2))):
    t = k * BEAT / 2
    if rng.uniform() < 0.45: continue
    v = [c for s, e, c in chords if s <= t < e][0]
    f = v[(k * 3) % len(v)] * 2
    bed.place(pluck(f), t, 0.035 * rng.uniform(0.7, 1.1), 0.3 * (1 if k % 2 else -1)); send.place(pluck(f), t, 0.02)
# a soft off-beat shaker 4–10 s (8 kHz low-passed)
for k in range(int(4.0 / BEAT), int(10.0 / BEAT)):
    t = k * BEAT + BEAT / 2; tt = np.arange(int(SR * 0.06)) / SR
    bed.place(lp(hp(rng.standard_normal(len(tt)), 3000), 8000) * np.exp(-tt / 0.018), t, 0.025, 0.2)

# ── the current: a hum while a pulse runs, a zip that follows its speed ──────────────────────────────────────────
spd = curve("current"); live = (spd > 1).astype(float)
live = signal.filtfilt(*signal.butter(1, 10 / (SR / 2)), live); zipe = np.clip(spd / 5000.0, 0, 1.2) ** 0.8
zipe = signal.filtfilt(*signal.butter(1, 25 / (SR / 2)), zipe); pan = curve("pan") * 0.5
zipsig = lp(bp(rng.standard_normal(N), 3000, 0.9), 8000) * zipe * 0.28
hum = (np.sin(2 * np.pi * 146.83 * t_ax) * 0.5 + np.sin(2 * np.pi * 293.66 * t_ax + 0.3) * 0.25) * live * (0.4 + 0.6 * np.clip(zipe, 0, 1))
cur = hum * 0.06 + zipsig
L, R = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
sfx.x[:N, 0] += cur * L; sfx.x[:N, 1] += cur * R; send.x[:N, 0] += cur * L * 0.2; send.x[:N, 1] += cur * R * 0.2

# ── events ───────────────────────────────────────────────────────────────────────────────────────────────────────
e = one("pad"); S(sub(55, 0.8), e["t"], 0.13, 0.0, 0.3); S(glass(NOTE(62), 1.4, 0.4), e["t"] + 0.02, 0.07, e["pan"] * 0.5, 0.5)
for e in ev("shoot"):
    S(lp(air(0.45, 280, 3000, 1.3, 0.3), 8000), e["t"] - 0.03, 0.12, e["pan"] * 0.5, 0.4)          # 8 kHz, ~6 dB under the draft
order = ["aur", "lr", "hxk", "cl", "arx"]
for i, k in enumerate(order):
    b = one("build", k)
    for j in range(4):                                                                                    # parts seating, 40 ms apart
        S(wood(900 + 140 * j + rng.uniform(-60, 60), 0.05), b["t"] + 0.16 + 0.38 + j * 0.04, 0.035, b["pan"] * 0.5, 0.15)
    a = one("arrive", k); f = PENTA[i]
    blip = (np.sin(2 * np.pi * f * np.arange(int(SR * 0.5)) / SR) + 0.2 * np.sin(4 * np.pi * f * np.arange(int(SR * 0.5)) / SR)) * np.exp(-np.arange(int(SR * 0.5)) / SR / 0.11)
    S(lp(blip, 7000), a["t"], 0.16, a["pan"] * 0.5, 0.5)                                                  # the power-on blip, on the beat
    S(sub(70, 0.35), a["t"], 0.08, a["pan"] * 0.4, 0.2)
e = one("blink", "aur"); S(bubble(1100, 0.08), e["t"] + 0.05, 0.05, e["pan"] * 0.5, 0.2)
e = one("roll", "lr"); tt = np.arange(int(SR * 0.5)) / SR
S(lp(bp(rng.standard_normal(len(tt)), 180, 1.2), 600) * np.sin(np.pi * np.clip(tt / 0.5, 0, 1)) ** 1.5, e["t"], 0.22, e["pan"] * 0.5, 0.15)
e = one("ripple", "hxk")
for j, f in enumerate([NOTE(86), NOTE(88), NOTE(90), NOTE(93)]):
    S(glass(f, 0.4, 0.5), e["t"] + j * 0.07, 0.03, e["pan"] * 0.5 + (j - 1.5) * 0.08, 0.4)
e = one("radar", "cl")
for j in range(2):
    tt = np.arange(int(SR * 0.6)) / SR; ping = np.sin(2 * np.pi * 1480 * tt) * np.exp(-tt / 0.09)
    S(ping, e["t"] + j * 0.16, 0.05 * (1 - 0.35 * j), e["pan"] * 0.5, 0.6)
e = one("props", "arx"); tt = np.arange(int(SR * 1.6)) / SR
rate = np.clip(tt / 0.35, 0, 1); whirr = lp(bp(rng.standard_normal(len(tt)), 420, 1.0) * (0.6 + 0.4 * np.sin(2 * np.pi * (6 + 18 * rate) * tt)), 5000)
S(whirr * np.clip(tt / 0.2, 0, 1) * np.clip((1.6 - tt) / 0.6, 0, 1), e["t"], 0.07, e["pan"] * 0.5, 0.25)
e = one("crane"); S(lp(air(1.6, 160, 1800, 1.1, 0.55), 6000), e["t"], 0.09, 0.0, 0.6)
e = one("converge"); tt = np.arange(int(SR * (one("logo")["t"] - e["t"]))) / SR
swell = (np.sin(2 * np.pi * NOTE(57) * tt) + 0.5 * np.sin(2 * np.pi * NOTE(64) * tt)) * (tt / tt[-1]) ** 2
S(lp(swell, 2500), e["t"], 0.04, 0.0, 0.5)
e = one("logo"); S(sub(46, 1.2), e["t"], 0.30, e["pan"] * 0.3, 0.45); S(glass(NOTE(62), 2.0, 0.4), e["t"] + 0.01, 0.08, e["pan"] * 0.4, 0.6)
e = one("wipe"); S(lp(air(0.8, 300, 2400, 1.2, 0.6), 8000), e["t"], 0.07, -0.2, 0.5)
e = one("stop")                                                                                            # the full stop: a crisp click
tt = np.arange(int(SR * 0.05)) / SR
click = hp(rng.standard_normal(len(tt)), 2500) * np.exp(-tt / 0.0025) * 0.8 + np.sin(2 * np.pi * 3300 * tt) * np.exp(-tt / 0.008) * 0.5
S(lp(click, 12000), e["t"], 0.22, e["pan"] * 0.5, 0.25); S(glass(NOTE(86), 0.9, 0.6), e["t"] + 0.004, 0.05, e["pan"] * 0.5, 0.5)
e = one("tag"); S(wood(2200, 0.03), e["t"] + 0.05, 0.03, 0.0, 0.2)
e = one("blink2", "aur"); S(bubble(1100, 0.08), e["t"] + 0.05, 0.04, e["pan"] * 0.5, 0.25)
for e in ev("loop"):
    S(lp(air(1.2, 400, 2200, 1.4, 0.4), 6000), e["t"], 0.035, 0.3, 0.6)

# ── mix, room, master to −16 LUFS / −1 dBTP ─────────────────────────────────────────────────────────────────────
ir = impulse(1.6)
room = np.stack([signal.fftconvolve(send.x[:, c], ir[:, c])[:len(send.x)] for c in (0, 1)], 1)
mix = (bed.x + sfx.x + room * 0.85)[:N]
mix = np.stack([hp(mix[:, c], 30) for c in (0, 1)], 1)
fade = np.ones(N); n_end = int(0.2 * SR); fade[-n_end:] = 10 ** (np.linspace(0, -60, n_end) / 20)   # only the last 0.2 s decays
mix *= fade[:, None]


def lufs(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    k = np.stack([signal.lfilter(b2, a2, signal.lfilter(b1, a1, x[:, c])) for c in (0, 1)], 1)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    z = np.array([np.mean(k[i:i + blk] ** 2, axis=0).sum() for i in range(0, len(k) - blk + 1, hop)])
    lk = -0.691 + 10 * np.log10(z + 1e-12); g = z[lk > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10; g2 = z[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(g2.mean())


def true_peak(x):
    return 20 * np.log10(max(np.abs(signal.resample_poly(x[:, c], 4, 1)).max() for c in (0, 1)) + 1e-12)


mix *= 10 ** ((-16.0 - lufs(mix)) / 20)
for _ in range(6):                                 # soft ceiling until the true peak is under −1.2 dBTP, re-levelled each pass
    tp = true_peak(mix)
    if tp <= -1.2: break
    ceil = 10 ** (-1.6 / 20); mix = np.tanh(mix / ceil * 0.9) * ceil / 0.9 * 0.98
    mix *= 10 ** ((-16.0 - lufs(mix)) / 20)
out = os.path.join(HERE, "out", "score.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
win = lambda a, b: 20 * np.log10(np.sqrt(np.mean(mix[int(a * SR):int(b * SR)] ** 2)) + 1e-12)
gaps = [round(i * 0.05, 2) for i in range(int((DUR - 0.2) / 0.05)) if win(i * 0.05, i * 0.05 + 0.05) < -50]
print(f"wrote {out}: {lufs(mix):.1f} LUFS, true peak {true_peak(mix):.1f} dBTP; 50 ms windows under −50 dB before the last 0.2 s: {gaps or 'none'}")
print("rms dB  open", round(win(0, 1), 1), " U1", round(win(2.0, 3.5), 1), " burst", round(win(5.0, 8.0), 1), " name", round(win(10, 11.5), 1), " end", round(win(12, 14.8), 1), " last", round(win(14.8, 15), 1))
