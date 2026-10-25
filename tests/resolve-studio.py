#!/usr/bin/env python3
"""Studio installer validation checks without invoking a real installer."""
import importlib.machinery
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/install-resolve-studio"
loader = importlib.machinery.SourceFileLoader("studio_installer", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class StudioTests(unittest.TestCase):
    def test_studio_metadata(self):
        self.assertEqual(module.validate_metadata(
            '<installer-script><title>DaVinci Resolve Studio</title></installer-script>',
            '<pkg-info identifier="com.blackmagic-design.Manifest" version="21.1.1"/>',
        ), "21.1.1")

    def test_free_or_unrecognized_installer_refused(self):
        with self.assertRaises(ValueError):
            module.validate_metadata(
                '<installer-script><title>DaVinci Resolve</title></installer-script>',
                '<pkg-info identifier="com.blackmagic-design.ManifestLite" version="21.1.1"/>',
            )

    def test_downgrade_refused(self):
        with self.assertRaises(ValueError):
            module.check_upgrade("19.1.1", "21.1.1")
        module.check_upgrade("21.1.1", "21.1.1")
        module.check_upgrade("21.1.2", "21.1.1")
        module.check_upgrade("21.1.1", None)

    def test_unsupported_version_refused(self):
        for value in ["", "21.1 beta", "21;touch /tmp/x"]:
            with self.assertRaises(ValueError):
                module.version_tuple(value)


if __name__ == "__main__":
    unittest.main()
