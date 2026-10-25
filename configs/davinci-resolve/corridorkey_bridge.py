#!/usr/bin/env python3
"""Local, SDR-only CorridorKey batch worker. Never modifies source media/timelines."""
import argparse
from fractions import Fraction
import json
import os
from pathlib import Path
import subprocess
import tempfile

PROFILE = "fp16/768x1280-t1"


def validate_video(probe):
    videos = [s for s in probe.get("streams", []) if s.get("codec_type") == "video"]
    if len(videos) != 1:
        raise ValueError("Select a source with exactly one video stream")
    stream = videos[0]
    if (stream.get("width"), stream.get("height")) != (1280, 720):
        raise ValueError("Only 1280x720 is supported; export a separate SDR test copy")
    if stream.get("color_transfer") != "iec61966-2-1":
        raise ValueError("Only explicitly tagged display-referred sRGB input is supported; no implicit colour conversion")
    if stream.get("field_order", "progressive") not in ("progressive", "unknown"):
        raise ValueError("Interlaced video is not supported")
    if stream.get("sample_aspect_ratio", "1:1") != "1:1":
        raise ValueError("Only square pixels are supported")
    try:
        fps = Fraction(stream["avg_frame_rate"])
        constant = Fraction(stream["r_frame_rate"])
        frames = int(stream["nb_read_frames"])
    except (KeyError, ValueError, ZeroDivisionError) as error:
        raise ValueError("Cannot establish source frame rate/count") from error
    if fps <= 0 or fps != constant or frames < 1:
        raise ValueError("A nonempty constant-frame-rate video is required")
    return frames, str(fps)


def validate_paths(source, output_root):
    source = Path(source).resolve(strict=True)
    target = Path(output_root).resolve()
    if not source.is_file():
        raise ValueError("Input must be one video file, not an image-sequence folder")
    if source == target or source in target.parents or target in source.parents:
        raise ValueError("Input and output must be separate, without nesting")


def validate_models(model_root):
    profile = Path(model_root) / PROFILE
    required = [profile / "stats.json"]
    required += [profile / stage / name for stage in ("rvm", "foundations", "stage1", "stage2")
                 for name in ("graph.json", "weights.safetensors")]
    missing = [str(p) for p in required if not p.is_file()]
    if missing:
        raise ValueError("Missing pinned model profile; run setup-corridorkey-resolve: " + ", ".join(missing))


def selected_path(pool):
    selected = pool.GetSelectedClips()
    if not selected or len(selected) != 1:
        raise ValueError("Select exactly one source clip in the Media Pool (not the timeline)")
    path = selected[0].GetClipProperty().get("File Path")
    if not path:
        raise ValueError("Selected item has no local source video path")
    return Path(path)


def import_outputs(pool, manifest):
    if manifest.get("status") != "complete":
        raise ValueError("Refusing to import an incomplete job")
    frames = manifest["frames"]
    job = Path(manifest["job"])
    rows = [{"FilePath": str(job / "cutout" / "%06d.png"), "StartIndex": 0, "EndIndex": frames - 1}]
    imported = pool.ImportMedia(rows)
    if not imported or len(imported) != 1:
        raise ValueError(f"Resolve did not import the cutout sequence; output preserved at {job}")
    expected_fps = float(Fraction(manifest["fps"]))
    for item in imported:
        if not item.SetClipProperty("FPS", str(expected_fps)):
            raise ValueError(f"Resolve refused sequence FPS; output preserved at {job}")
        actual = item.GetClipProperty()
        if abs(float(actual.get("FPS", 0)) - expected_fps) > 0.001:
            raise ValueError(f"Resolve sequence FPS mismatch; output preserved at {job}")
    if not imported[0].SetClipProperty("Alpha mode", "Straight"):
        raise ValueError(f"Resolve refused straight alpha; output preserved at {job}")
    if imported[0].GetClipProperty().get("Alpha mode") != "Straight":
        raise ValueError(f"Resolve alpha interpretation mismatch; output preserved at {job}")
    return imported


def verify_frames(job, count):
    # Runs only inside the pinned MLX Python environment (OpenCV/numpy available).
    import cv2
    import numpy as np
    for kind, channels in (("alpha", 3), ("cutout", 4)):
        files = sorted((job / kind).glob("*.png"))
        expected = [f"{i:06d}.png" for i in range(count)]
        if [p.name for p in files] != expected:
            raise ValueError(f"Incomplete {kind} sequence; no import will be attempted")
        for path in files:
            frame = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
            if frame is None or frame.shape[:2] != (720, 1280) or frame.dtype != np.uint16:
                raise ValueError(f"Invalid output dimensions/bit depth: {path}")
            actual_channels = 1 if frame.ndim == 2 else frame.shape[2]
            if actual_channels != channels:
                raise ValueError(f"Invalid output channels: {path}")
            if kind == "alpha" and not (np.array_equal(frame[..., 0], frame[..., 1])
                                        and np.array_equal(frame[..., 0], frame[..., 2])):
                raise ValueError(f"Alpha RGB channels differ: {path}")


def process(source, output_root, runtime, ffprobe):
    source = Path(source).resolve(strict=True)
    output_root = Path(output_root).resolve()
    runtime = Path(runtime).resolve(strict=True)
    validate_paths(source, output_root)
    validate_models(runtime / "models")
    probe = subprocess.run([ffprobe, "-v", "error", "-count_frames", "-show_streams", "-of", "json", str(source)],
                           capture_output=True, text=True, check=True)
    frames, fps = validate_video(json.loads(probe.stdout))
    output_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    job = Path(tempfile.mkdtemp(prefix="corridorkey-", dir=output_root))
    manifest = {"status": "running", "source": str(source), "job": str(job), "frames": frames,
                "fps": fps, "profile": PROFILE, "audio": "not copied", "timeline": "unchanged"}
    manifest_path = job / "manifest.json"
    try:
        command = [str(runtime / "venv/bin/corridorkey-mlx"), "--input", str(source), "--output-dir", str(job),
                   "--model-root", str(runtime / "models"), "--precision", "fp16", "--height", "768", "--width", "1280",
                   "--hann-chunk", "1", "--hann-stride", "1", "--compile", "--image-sequence",
                   "--outputs", "alpha", "cutout", "--benchmark-json", str(job / "benchmark.json")]
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        with (job / "inference.log").open("w") as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
        # Verify in the MLX environment, never load its libraries in Resolve's interpreter.
        subprocess.run([str(runtime / "venv/bin/python"), str(Path(__file__).resolve()),
                        "--verify-job", str(job), "--frames", str(frames)], check=True)
        manifest["status"] = "complete"
    except Exception as error:
        manifest.update(status="failed", error=str(error))
        raise RuntimeError(f"CorridorKey failed; job/logs preserved at {job}: {error}") from error
    finally:
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, nargs="?")
    parser.add_argument("--runtime", type=Path, default=Path.home() / "Library/Application Support/CorridorKey-Resolve")
    parser.add_argument("--output-root", type=Path, default=Path.home() / "Movies/CorridorKey")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--verify-job", type=Path)
    parser.add_argument("--frames", type=int)
    args = parser.parse_args()
    os.umask(0o077)
    if args.verify_job:
        verify_frames(args.verify_job, args.frames)
        return
    if not args.input:
        parser.error("a local input video is required")
    manifest = process(args.input, args.output_root, args.runtime, args.ffprobe)
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
