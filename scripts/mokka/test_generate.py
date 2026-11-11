import json
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch

import numpy as np
from PIL import Image

import unittest

from scripts.mokka import generate


class PaletteTests(unittest.TestCase):
    def test_palette_mix_preserves_endpoints(self):
        self.assertEqual(generate.palette_for_mix(0.0), generate.MOCHA)
        self.assertEqual(generate.palette_for_mix(1.0), generate.LATTE)

    def test_palette_mix_blends_transition_colours(self):
        palette = generate.palette_for_mix(0.5)
        mocha = generate.hex_to_rgb(generate.MOCHA["base"])
        latte = generate.hex_to_rgb(generate.LATTE["base"])
        self.assertEqual(
            generate.hex_to_rgb(palette["base"]),
            generate.lerp3(mocha, latte, 0.5),
        )


class SlotValidationTests(unittest.TestCase):
    def test_default_slots_are_valid_and_keep_all_timestamps(self):
        generate.validate_slots(generate.SLOTS)
        self.assertEqual(
            [slot["time"] for slot in generate.SLOTS],
            [
                "04:00:00",
                "06:00:00",
                "08:00:00",
                "10:00:00",
                "12:00:00",
                "14:00:00",
                "16:00:00",
                "18:00:00",
                "20:00:00",
                "21:00:00",
                "22:00:00",
                "00:00:00",
            ],
        )

    def test_invalid_palette_mix_is_rejected(self):
        invalid = [dict(generate.SLOTS[0], latte_mix=1.1)]
        with self.assertRaisesRegex(ValueError, "latte_mix"):
            generate.validate_slots(invalid)

    def test_invalid_timestamp_is_rejected(self):
        invalid = [dict(generate.SLOTS[0], time="24:00:00")]
        with self.assertRaisesRegex(ValueError, "timestamp"):
            generate.validate_slots(invalid)

    def test_wallpapper_entries_cover_every_slot(self):
        entries = generate.wallpapper_entries(generate.SLOTS)
        self.assertEqual(len(entries), 12)
        self.assertTrue(entries[0]["isPrimary"])
        self.assertNotIn("isPrimary", entries[1])
        self.assertEqual(entries[-1]["time"], "00:00:00")
        self.assertEqual(entries[-1]["fileName"], "11_000000.png")


class RenderingTests(unittest.TestCase):
    def test_rendered_frame_is_deterministic_rgb(self):
        slot = generate.SLOTS[2]
        first = generate.generate_slot_image(slot, (240, 160))
        second = generate.generate_slot_image(slot, (240, 160))
        self.assertEqual(first.mode, "RGB")
        self.assertEqual(first.size, (240, 160))
        self.assertEqual(first.tobytes(), second.tobytes())

    def test_approved_styles_are_two_colour_and_edge_cropped(self):
        for style in ("blackhole-circle", "eclipse", "orbital-horizon", "torus"):
            for size in ((240, 160), (117, 253)):
                with self.subTest(style=style, size=size):
                    image = generate.generate_slot_image(generate.SLOTS[0], size, style)
                    background = generate.hex_to_rgb(generate.MOCHA["base"])
                    colours = set(image.get_flattened_data())
                    self.assertEqual(len(colours), 2)
                    self.assertIn(background, colours)
                    width, height = size
                    edges = [
                        image.crop(box) for box in (
                            (0, 0, width, 1), (0, height - 1, width, height),
                            (0, 0, 1, height), (width - 1, 0, width, height),
                        )
                    ]
                    self.assertGreaterEqual(sum(
                        any(pixel != background for pixel in edge.get_flattened_data())
                        for edge in edges
                    ), 2)

    def test_all_slots_keep_identical_geometry_in_each_style(self):
        for style in generate.STYLES:
            masks = []
            for slot in generate.SLOTS:
                image = generate.generate_slot_image(slot, (240, 160), style)
                palette = generate.palette_for_mix(slot["latte_mix"])
                background = generate.hex_to_rgb(palette["base"])
                masks.append(np.any(np.asarray(image) != background, axis=-1))
            self.assertTrue(all(np.array_equal(masks[0], mask) for mask in masks))

    def test_unknown_style_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unknown style"):
            generate.generate_slot_image(generate.SLOTS[0], (240, 160), "unknown")

    def test_invalid_dimensions_are_rejected(self):
        for size in ((0, 160), (240, -1)):
            with self.assertRaisesRegex(ValueError, "dimensions"):
                generate.generate_slot_image(generate.SLOTS[0], size)


class PipelineTests(unittest.TestCase):
    def test_png_pipeline_preserves_metadata_without_calling_wallpapper(self):
        render = generate.generate_slot_image
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(generate, "generate_slot_image", side_effect=
                              lambda slot, **kw: render(slot, (240, 160), **kw)), \
                 patch.object(generate.subprocess, "run") as assemble:
                generate.generate(output_dir=directory, png_only=True)
            entries = json.loads((Path(directory) / "wallpapper.json").read_text())
            self.assertEqual(entries, generate.wallpapper_entries(generate.SLOTS))
            self.assertEqual(len(list(Path(directory).glob("*.png"))), 12)
            assemble.assert_not_called()

    def test_failed_assembly_preserves_previous_heic(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mokka.heic"
            path.write_bytes(b"previous wallpaper")
            error = subprocess.CalledProcessError(1, "wallpapper")
            with patch.object(Path, "is_file", return_value=True), \
                 patch.object(generate, "generate_slot_image",
                              return_value=Image.new("RGB", (12, 8))), \
                 patch.object(generate.subprocess, "run", side_effect=error):
                with self.assertRaises(subprocess.CalledProcessError):
                    generate.generate(output_dir=directory)
            self.assertEqual(path.read_bytes(), b"previous wallpaper")
            self.assertFalse((Path(directory) / "mokka.pending.heic").exists())

    def test_direct_cli_phone_export(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run([sys.executable, str(Path(generate.__file__).resolve()),
                            "--phone", "--style", "eclipse", "--output-dir", directory],
                           check=True, capture_output=True)
            files = list(Path(directory).glob("*.png"))
            self.assertEqual(len(files), 2)
            self.assertFalse((Path(directory) / "wallpapper.json").exists())
            for path in files:
                with Image.open(path) as image:
                    self.assertEqual(image.size, (1170, 2532))
                    image.verify()


if __name__ == "__main__":
    unittest.main()
