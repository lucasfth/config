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

    def test_dot_field_uses_only_muted_palette_colours(self):
        slot = generate.SLOTS[9]
        image = generate.generate_slot_image(slot, (240, 160))
        palette = generate.palette_for_mix(slot["latte_mix"])
        base = generate.hex_to_rgb(palette["crust"])
        allowed = {base} | {
            generate.muted_dot_colour(base, generate.hex_to_rgb(palette[key]))
            for key in (
                "surface0",
                "lavender",
                "mauve",
                "blue",
                "rosewater",
            )
        }
        colours = set(image.get_flattened_data())
        self.assertGreater(len(colours), 1)
        self.assertLessEqual(colours, allowed)

    def test_dot_colour_is_blended_toward_the_background(self):
        base = generate.hex_to_rgb(generate.MOCHA["crust"])
        accent = generate.hex_to_rgb(generate.MOCHA["lavender"])
        self.assertEqual(
            generate.muted_dot_colour(base, accent),
            generate.lerp3(base, accent, 0.55),
        )

    def test_dot_colours_change_on_a_regular_lattice(self):
        slot = generate.SLOTS[9]
        image = generate.generate_slot_image(slot, (240, 160))
        base = generate.hex_to_rgb(generate.MOCHA["crust"])
        centres = [
            image.getpixel((x, y))
            for y in range(3, image.height, 7)
            for x in range(3, image.width, 7)
        ]
        self.assertTrue(all(colour != base for colour in centres))
        self.assertGreaterEqual(len(set(centres)), 3)
        self.assertEqual(image.getpixel((0, 0)), base)


if __name__ == "__main__":
    unittest.main()
