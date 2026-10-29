#!/usr/bin/env python3
"""export_v3.py — the v3 deliverables: the 60 fps render with draft_v1's soundtrack copied unchanged, and a
side-by-side against draft_v1 for review.

  python3 export_v3.py out/v3_video.mp4      # → out/b_audio.m4a, out/v3.mp4, out/compare.mp4

v3 keeps v1's timeline to the frame, so v1's audio stream is copied as it is (no re-encode) and stays in sync.
compare.mp4: draft_v1 on the left (resampled to 60 fps), v3 on the right, v3's audio.
"""
import pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"


def run(cmd):
    print("$", " ".join(map(str, cmd)), flush=True)
    subprocess.run(cmd, check=True)


def main():
    src = pathlib.Path(sys.argv[1]).resolve()
    b, audio, mp4, cmp = OUT / "draft_v1.mp4", OUT / "b_audio.m4a", OUT / "v3.mp4", OUT / "compare.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", b, "-vn", "-c:a", "copy", audio])
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy",
         "-movflags", "+faststart", mp4])
    run(["ffmpeg", "-v", "error", "-y", "-i", b, "-i", mp4, "-filter_complex", "[0:v]fps=60,scale=960:540[b];[1:v]scale=960:540[n];[b][n]hstack",
         "-map", "1:a?", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", cmp])
    for f in (audio, mp4, cmp):
        print(f, f"{f.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
