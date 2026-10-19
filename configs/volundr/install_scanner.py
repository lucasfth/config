#!/usr/bin/env python3
"""Install one pinned Gitleaks binary with an explicit archive checksum."""
import argparse
import hashlib
import io
import os
from pathlib import Path
import platform
import tarfile
import urllib.request

VERSION = '8.30.1'
ASSETS = {
    ('Darwin', 'arm64'): ('darwin_arm64', 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5'),
    ('Linux', 'aarch64'): ('linux_arm64', 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080'),
    ('Linux', 'x86_64'): ('linux_x64', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'),
}


def install(destination):
    key = platform.system(), platform.machine()
    if key[0] == 'Android':key = 'Linux', key[1]
    asset, expected = ASSETS[key]
    url = f'https://github.com/gitleaks/gitleaks/releases/download/v{VERSION}/gitleaks_{VERSION}_{asset}.tar.gz'
    with urllib.request.urlopen(url, timeout=60) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != expected:
        raise ValueError('Gitleaks archive checksum mismatch')
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        member = source.getmember('gitleaks')
        if not member.isfile():raise ValueError('Invalid scanner archive')
        binary = source.extractfile(member).read()
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = destination.with_suffix('.new')
    temporary.write_bytes(binary);temporary.chmod(0o700);temporary.replace(destination)
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    print(install(args.destination))
