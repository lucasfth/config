#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('worker', ROOT / 'configs/davinci-resolve/native/worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class Protocol(unittest.TestCase):
    def header(self, **changes):
        values = dict(width=1280, height=720, screen=0, output=0, despill=1., encoding=0)
        values.update(changes)
        return struct.pack('<8sIIIIfI', b'CK2OFX01', *values.values())
    def test_supported_header(self):
        self.assertEqual(worker.parse_header(self.header())[:2], (1280, 720))
    def test_refuse_invalid_header(self):
        for changes in [dict(width=1920), dict(screen=3), dict(output=2), dict(encoding=3), dict(despill=float('nan')), dict(despill=-1.)]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                worker.parse_header(self.header(**changes))
        with self.assertRaises(ValueError): worker.parse_header(b'bad')
        with self.assertRaises(ValueError): worker.parse_header(b'BADMAGIC'+self.header()[8:])
    def test_truncated_transfer(self):
        import io
        with self.assertRaises(EOFError): worker.read_exact(io.BytesIO(b'x'), 10)
    def test_uint16_bgra_boundary_to_premultiplied_host_pixels(self):
        import numpy as np
        bgra = np.array([[[[65535, 0, 32768, 32768]]]], dtype=np.uint16)
        result = worker.to_host(bgra, 0, 0)
        self.assertAlmostEqual(float(result[0,0,3]), 32768/65535, places=6)
        self.assertAlmostEqual(float(result[0,0,2]), 32768/65535, places=6)
        self.assertLess(float(result[0,0,0]), .26)
        matte = worker.to_host(bgra, 1, 0)
        np.testing.assert_allclose(matte[...,:3], 32768/65535)
        self.assertEqual(float(matte[0,0,3]), 1.)
        linear = worker.to_host(bgra, 0, 1)
        srgb = 32768 / 65535
        expected = ((srgb + .055) / 1.055) ** 2.4 * srgb
        self.assertAlmostEqual(float(linear[0,0,0]), expected, places=6)
        np.testing.assert_allclose(worker.to_host(bgra, 1, 1), matte)

if __name__ == '__main__': unittest.main()
