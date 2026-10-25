#!/usr/bin/env python3
"""Isolated bridge contracts; no running Resolve or user media required."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess
import json

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("bridge", ROOT / "configs/davinci-resolve/corridorkey_bridge.py")
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


def metadata(**changes):
    stream = dict(width=1280, height=720, codec_type="video", color_transfer="iec61966-2-1",
                  avg_frame_rate="24000/1001", r_frame_rate="24000/1001", nb_read_frames="4",
                  field_order="progressive", sample_aspect_ratio="1:1")
    stream.update(changes)
    return {"streams": [stream]}


class BridgeTests(unittest.TestCase):
    def test_metadata(self):
        self.assertEqual(bridge.validate_video(metadata()), (4, "24000/1001"))
        for changes in ({"width": 1920}, {"color_transfer": "smpte2084"},
                        {"color_transfer": "unknown"}, {"avg_frame_rate": "30/1"},
                        {"nb_read_frames": "N/A"}, {"sample_aspect_ratio": "2:1"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                bridge.validate_video(metadata(**changes))

    def test_paths_and_missing_models(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "clip.mov"
            source.touch()
            bridge.validate_paths(source, root / "outputs")
            for path in (source, root):
                with self.assertRaises(ValueError):
                    bridge.validate_paths(source, path)
            with self.assertRaises(ValueError):
                bridge.validate_paths(root, root / "outputs")
            with self.assertRaises(ValueError):
                bridge.validate_models(root)

    def test_one_selected_clip_only(self):
        class Clip:
            def GetClipProperty(self):
                return {"File Path": "/tmp/clip with spaces.mov"}
        class Pool:
            def GetSelectedClips(self):
                return self.selection
        pool = Pool()
        for selection in ([], [Clip(), Clip()]):
            pool.selection = selection
            with self.assertRaises(ValueError):
                bridge.selected_path(pool)
        pool.selection = [Clip()]
        self.assertEqual(bridge.selected_path(pool), Path("/tmp/clip with spaces.mov"))

    def test_import_contract(self):
        class Item:
            def __init__(self):
                self.properties = {}
            def SetClipProperty(self, key, value):
                self.properties[key] = value
                return True
            def GetClipProperty(self):
                return self.properties
        class Pool:
            def ImportMedia(self, rows):
                self.rows = rows
                self.items = [Item() for _ in rows]
                return self.items
        pool = Pool()
        manifest = {"status": "complete", "frames": 4, "fps": "24000/1001", "job": "/tmp/job"}
        bridge.import_outputs(pool, manifest)
        self.assertEqual(pool.rows, [{"FilePath": "/tmp/job/cutout/%06d.png", "StartIndex": 0, "EndIndex": 3}])
        self.assertEqual(pool.items[0].properties["Alpha mode"], "Straight")
        self.assertAlmostEqual(float(pool.items[0].properties["FPS"]), 24000 / 1001, places=5)
        manifest["status"] = "failed"
        with self.assertRaises(ValueError):
            bridge.import_outputs(pool, manifest)

    def test_inference_failure_is_not_complete(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "clip.mov"
            source.touch()
            calls = [subprocess.CompletedProcess([], 0, json.dumps(metadata()), ""),
                     subprocess.CalledProcessError(1, ["inference"])]
            with patch.object(bridge, "validate_models"), patch.object(bridge.subprocess, "run", side_effect=calls):
                with self.assertRaises(RuntimeError):
                    bridge.process(source, root / "outputs", root, "ffprobe")
            manifest = json.loads(next((root / "outputs").glob("*/manifest.json")).read_text())
            self.assertEqual(manifest["status"], "failed")
            self.assertEqual(next((root / "outputs").iterdir()).stat().st_mode & 0o777, 0o700)

    def test_failed_import_is_reported(self):
        class Pool:
            def ImportMedia(self, rows):
                return []
        with self.assertRaises(ValueError):
            bridge.import_outputs(Pool(), {"status": "complete", "frames": 4, "fps": "24", "job": "/tmp/job"})


if __name__ == "__main__":
    unittest.main()
