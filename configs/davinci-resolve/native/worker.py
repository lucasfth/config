#!/usr/bin/env python3
# Original CorridorKey OFX adapter; model/engine retain their upstream licences.
"""Private pipe protocol: little-endian header + top-down float32 RGBA pixels.

One persistent model, stateless frames, one-entry result cache (~14 MiB).
Stdout is exclusively protocol bytes; diagnostics go to stderr. No socket/files
from host-supplied paths. Only the existing user-owned runtime is loaded.
"""
import hashlib
import math
import os
from pathlib import Path
import struct
import sys

HEADER = struct.Struct('<8sIIIIfI')
WIDTH, HEIGHT = 1280, 720
PAYLOAD = WIDTH * HEIGHT * 4 * 4


def parse_header(data):
    if len(data) != HEADER.size:
        raise ValueError('Invalid frame header size')
    magic, width, height, screen, output, despill, encoding = HEADER.unpack(data)
    if magic != b'CK2OFX01' or (width, height) != (WIDTH, HEIGHT):
        raise ValueError('CorridorKey 2.0 currently requires full-frame 1280x720')
    if screen not in (0, 1) or output not in (0, 1) or encoding not in (0, 1):
        raise ValueError('Unsupported screen, output or colour encoding')
    if not math.isfinite(despill) or not 0 <= despill <= 1:
        raise ValueError('Invalid despill strength')
    return width, height, screen, output, despill, encoding


def read_exact(stream, count):
    chunks = bytearray()
    while len(chunks) < count:
        block = stream.read(count - len(chunks))
        if not block:
            raise EOFError('Truncated frame transfer')
        chunks.extend(block)
    return bytes(chunks)


def to_host(bgra, output, encoding):
    import numpy as np
    rgba = bgra[0, :, :, [2, 1, 0, 3]].transpose(1, 2, 0).astype(np.float32) / 65535.
    if output:
        rgba[..., :3] = rgba[..., 3:4]
        rgba[..., 3] = 1.
    else:
        if encoding:
            rgb = rgba[..., :3]
            rgba[..., :3] = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
        rgba[..., :3] *= rgba[..., 3:4]
    return np.ascontiguousarray(rgba, dtype='<f4')


class Engine:
    def __init__(self, runtime):
        import torch
        from corridorkey_mlx.mlx_backend import MLXModel
        from corridorkey_mlx.pipeline import encode_frame, checkerboard
        self.torch, self.encode_frame = torch, encode_frame
        self.model = MLXModel(runtime / 'models/fp16', 768, 1280, compile_graph=True)
        self.checker = checkerboard(720, 1280)

    def infer(self, rgba, screen, output, despill, encoding):
        import numpy as np
        import torch.nn.functional as F
        torch = self.torch
        if not np.isfinite(rgba).all():
            raise ValueError('Input contains non-finite pixels')
        if np.any(rgba[..., 3] < .99999):
            raise ValueError('Use an opaque source before keying; input alpha is not supported')
        rgb = rgba[..., :3]
        if encoding:
            if np.any(rgb < 0) or np.any(rgb > 1):
                raise ValueError('Only SDR linear-sRGB values in [0,1] are supported')
            rgb = np.where(rgb <= .0031308, rgb * 12.92, 1.055 * np.maximum(rgb, .0031308) ** (1/2.4) - .055)
        elif np.any(rgb < 0) or np.any(rgb > 1):
            raise ValueError('Only SDR sRGB values in [0,1] are supported')
        bgr = np.ascontiguousarray(np.rint(np.clip(rgb[..., ::-1], 0, 1) * 65535).astype(np.uint16))
        with torch.no_grad():
            encoded, display = self.encode_frame(bgr, (768, 1280))
            small = F.interpolate(display[None], size=(192, 320), mode='bilinear', align_corners=False)
            recurrent, _ = self.model.foundations.rvm(small[None].clamp(0, 1), None)
            mean = self.model.foundations.rvm_mean.reshape(1, 1, -1, 1, 1)
            std = self.model.foundations.rvm_std.reshape(1, 1, -1, 1, 1).clamp_min(1e-6)
            rvm = ((recurrent - mean) / std).to(torch.float16).float()
            features = self.model.foundations(
                F.interpolate(display[None], size=(192, 320), mode='area'),
                F.interpolate(display[None], size=(168, 280), mode='area'))
            rgb_tensor = encoded[None, None]
            stage1 = self.model.stage1(rgb_tensor, torch.zeros(1, 1, 1, 768, 1280),
                features['moge'][None], features['cradio'][None], rvm,
                torch.full((1, 1), -1.).bfloat16().float())
            baton = stage1['baton'].to(torch.float16).float()
            prediction = self.model.stage2(rgb_tensor, baton)
            meta = dict(model_native_hw=(720, 1280), output_hw=(720, 1280), pad=(0, 0, 24, 0),
                        despill_strength=despill, screen=('green', 'blue')[screen])
            result = self.model._render_predictions(meta, {'cutout'}, self.checker, prediction[0])
            return to_host(result['cutout'], output, encoding)


def serve(runtime):
    # Duplicate the protocol fd, then redirect fd 1 as well as Python stdout.
    # Native libraries using printf/write(1) must not corrupt frame replies.
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), 'wb', buffering=0)
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    engine = None
    cached_key = cached_value = None
    while True:
        first = sys.stdin.buffer.read(1)
        if not first:
            return
        try:
            header = first + read_exact(sys.stdin.buffer, HEADER.size - 1)
            _, _, screen, output, despill, encoding = parse_header(header)
            pixels = read_exact(sys.stdin.buffer, PAYLOAD)
            # All parameters and pixels participate, not just time/frame number.
            key = hashlib.sha256(header + pixels).digest()
            if key != cached_key:
                import numpy as np
                if engine is None:
                    engine = Engine(runtime)
                rgba = np.frombuffer(pixels, dtype='<f4').reshape(HEIGHT, WIDTH, 4)
                cached_value = engine.infer(rgba, screen, output, despill, encoding).tobytes()
                cached_key = key
            protocol.write(struct.pack('<II', 0, len(cached_value)))
            protocol.write(cached_value)
        except Exception as error:
            message = str(error).encode('utf-8', errors='replace')[:4096]
            print('CorridorKey OFX:', error, file=sys.stderr)
            protocol.write(struct.pack('<II', 1, len(message)))
            protocol.write(message)
            return  # Bad headers/truncated streams are not resynchronizable.


if __name__ == '__main__':
    runtime = Path.home() / 'Library/Application Support/CorridorKey-Resolve'
    if not (runtime / 'ready.json').is_file():
        raise SystemExit('Set up the licensed CorridorKey runtime before using this effect')
    serve(runtime)
