#!/usr/bin/env python3
"""Package a precompiled Linux/ARM64 binary as a scratch OCI image, without a VM."""

import hashlib
import io
import json
import pathlib
import sys
import tarfile


def add_file(archive, name, data, mode=0o644):
    entry = tarfile.TarInfo(name)
    entry.size = len(data)
    entry.mode = mode
    archive.addfile(entry, io.BytesIO(data))


def build(binary, destination):
    layer_buffer = io.BytesIO()
    with tarfile.open(fileobj=layer_buffer, mode="w") as layer:
        add_file(layer, "hbit", binary.read_bytes(), 0o555)
    layer = layer_buffer.getvalue()
    blobs = {}

    def blob(data, media_type):
        digest = hashlib.sha256(data).hexdigest()
        blobs[digest] = data
        return {"mediaType": media_type, "digest": "sha256:" + digest, "size": len(data)}

    def encode(value):
        return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()

    layer_desc = blob(layer, "application/vnd.oci.image.layer.v1.tar")
    config = blob(encode({
        "architecture": "arm64",
        "os": "linux",
        "config": {"Entrypoint": ["/hbit"], "User": "10001:10001", "ExposedPorts": {"2222/tcp": {}}},
        "rootfs": {"type": "layers", "diff_ids": [layer_desc["digest"]]},
    }), "application/vnd.oci.image.config.v1+json")
    manifest = blob(encode({
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "config": config,
        "layers": [layer_desc],
    }), "application/vnd.oci.image.manifest.v1+json")
    manifest["annotations"] = {"org.opencontainers.image.ref.name": "hbit:bootstrap"}
    manifest["platform"] = {"os": "linux", "architecture": "arm64"}
    with tarfile.open(destination, "w") as archive:
        add_file(archive, "oci-layout", encode({"imageLayoutVersion": "1.0.0"}))
        add_file(archive, "index.json", encode({"schemaVersion": 2, "manifests": [manifest]}))
        for digest, data in sorted(blobs.items()):
            add_file(archive, "blobs/sha256/" + digest, data)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-image.py LINUX_ARM64_BINARY OUTPUT_TAR")
    build(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
