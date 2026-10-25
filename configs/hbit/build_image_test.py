import hashlib
import importlib.util
import io
import json
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("build_image", pathlib.Path(__file__).with_name("build-image.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImageTests(unittest.TestCase):
    def test_image_is_reproducible_and_nonroot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            binary = root / "hbit"
            binary.write_bytes(b"test-binary")
            first, second = root / "first.tar", root / "second.tar"
            module.build(binary, first)
            module.build(binary, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with tarfile.open(first) as archive:
                index = json.load(archive.extractfile("index.json"))

                def blob(descriptor):
                    data = archive.extractfile("blobs/" + descriptor["digest"].replace(":", "/")).read()
                    self.assertEqual(len(data), descriptor["size"])
                    self.assertEqual("sha256:" + hashlib.sha256(data).hexdigest(), descriptor["digest"])
                    return data

                manifest = json.loads(blob(index["manifests"][0]))
                config = json.loads(blob(manifest["config"]))
                self.assertEqual(config["architecture"], "arm64")
                self.assertEqual(config["os"], "linux")
                self.assertEqual(config["config"]["User"], "10001:10001")
                self.assertEqual(config["config"]["Entrypoint"], ["/hbit"])
                self.assertIn("USER 10001:10001", pathlib.Path(__file__).with_name("Dockerfile").read_text())
                self.assertEqual(config["rootfs"]["diff_ids"], [manifest["layers"][0]["digest"]])
                with tarfile.open(fileobj=io.BytesIO(blob(manifest["layers"][0]))) as layer:
                    self.assertEqual(layer.getnames(), ["hbit"])
                    self.assertEqual(layer.getmember("hbit").mode, 0o555)
                    self.assertEqual(layer.extractfile("hbit").read(), binary.read_bytes())


if __name__ == "__main__":
    unittest.main()
