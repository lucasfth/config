#!/usr/bin/env python3
# Original CorridorKey OFX adapter; model/engine retain their upstream licences.
"""Persistent MLX model, stateless frames, one-entry source-size result cache.

Private CK2OFX02 protocol: 52-byte little-endian header, packed top-down float32
RGBA input/output. Stdout fd is exclusively binary replies, never diagnostics.
"""
import hashlib
import math
import os
from pathlib import Path
import struct
import sys

HEADER = struct.Struct('<8sIIIIfIIffff')
WIDTH, HEIGHT = 1280, 720
MAX_PIXELS = 40_000_000


def parse_header(data):
    if len(data) != HEADER.size:
        raise ValueError('Invalid frame header size')
    magic, width, height, screen, output, despill, encoding, policy, black, white, grow, softness = HEADER.unpack(data)
    if magic != b'CK2OFX02':
        raise ValueError('Incompatible CorridorKey worker protocol')
    # Python integers cannot overflow; division also mirrors the native pre-allocation guard.
    if not (1 <= width <= 8192 and 1 <= height <= 8192 and width <= MAX_PIXELS // height):
        raise ValueError('Supported source size: 1..8192 per side, at most 40 million pixels')
    if screen not in (0, 1) or output not in range(5) or encoding not in range(3) or policy not in (0, 1):
        raise ValueError('Unsupported screen, output, colour encoding or resolution policy')
    if policy == 1 and (width, height) != (WIDTH, HEIGHT):
        raise ValueError('Strict policy requires 1280x720; choose Fit source to accept other sizes')
    if not math.isfinite(despill) or not 0 <= despill <= 1:
        raise ValueError('Despill must be in [0,1]')
    if not all(math.isfinite(v) for v in (black, white, grow, softness)):
        raise ValueError('Matte controls must be finite')
    if not 0 <= black < white <= 1:
        raise ValueError('Matte white level must exceed black level, both in [0,1]')
    if not -20 <= grow <= 20 or not 0 <= softness <= 20:
        raise ValueError('Grow/shrink must be -20..20 pixels; softness 0..20 pixels')
    return width, height, screen, output, despill, encoding, policy, black, white, grow, softness


def read_exact(stream, count):
    chunks = bytearray()
    while len(chunks) < count:
        block = stream.read(count - len(chunks))
        if not block:
            raise EOFError('Truncated frame transfer')
        chunks.extend(block)
    return bytes(chunks)


def to_display(rgb, encoding):
    import numpy as np
    if not np.isfinite(rgb).all() or np.any(rgb < 0) or np.any(rgb > 1):
        raise ValueError('Only finite SDR input values in [0,1] are supported; convert log/HDR upstream')
    if encoding == 0:
        return rgb
    linear = rgb if encoding == 1 else rgb ** 2.4
    return np.where(linear <= .0031308, linear * 12.92,
                    1.055 * np.maximum(linear, .0031308) ** (1 / 2.4) - .055)


def from_display(rgb, encoding):
    import numpy as np
    rgb = np.clip(rgb, 0, 1)
    if encoding == 0:
        return rgb
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    return linear if encoding == 1 else linear ** (1 / 2.4)


def fit_frame(rgb):
    import cv2
    height, width = rgb.shape[:2]
    scale = min(WIDTH / width, HEIGHT / height)
    nw, nh = min(WIDTH, max(1, round(width * scale))), min(HEIGHT, max(1, round(height * scale)))
    x, y = (WIDTH - nw) // 2, (HEIGHT - nh) // 2
    image = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    canvas = cv2.copyMakeBorder(image, y, HEIGHT - nh - y, x, WIDTH - nw - x, cv2.BORDER_REFLECT_101)
    return canvas, (x, y, nw, nh)


def restore_frame(image, box, shape):
    import cv2
    x, y, width, height = box
    crop = image[y:y + height, x:x + width]
    if crop.shape[:2] == shape:
        return crop
    return cv2.resize(crop, (shape[1], shape[0]), interpolation=cv2.INTER_LINEAR)


def refine_alpha(alpha, black, white, grow, softness):
    import cv2
    import numpy as np
    result = np.clip((alpha - black) / (white - black), 0, 1)
    if grow:
        radius = math.ceil(abs(grow))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
        changed = cv2.dilate(result, kernel) if grow > 0 else cv2.erode(result, kernel)
        # Fractional pixels interpolate neighbouring integer-radius results.
        inner = math.floor(abs(grow))
        if inner != radius:
            small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (inner * 2 + 1, inner * 2 + 1))
            previous = cv2.dilate(result, small) if grow > 0 else cv2.erode(result, small)
            amount = abs(grow) - inner
            changed = previous * (1 - amount) + changed * amount
        result = changed
    if softness:
        result = cv2.GaussianBlur(result, (0, 0), sigmaX=softness, borderType=cv2.BORDER_REFLECT_101)
    return np.clip(result, 0, 1).astype(np.float32)


def compose(foreground, alpha, output, encoding):
    import numpy as np
    result = np.empty((*alpha.shape, 4), dtype='<f4')
    if output == 1:
        result[..., :3] = alpha[..., None]
        result[..., 3] = 1
    elif output == 4:
        y, x = np.ogrid[:alpha.shape[0], :alpha.shape[1]]
        checker = np.where(((x // 24 + y // 24) % 2)[..., None], np.float32(.65), np.float32(.35))
        linear = from_display(foreground, 1) * alpha[..., None] + from_display(checker, 1) * (1 - alpha[..., None])
        result[..., :3] = linear if encoding == 1 else (linear ** (1 / 2.4) if encoding == 2 else to_display(linear, 1))
        result[..., 3] = 1
    else:
        result[..., :3] = from_display(foreground, encoding)
        if output == 0:
            result[..., :3] *= alpha[..., None]
            result[..., 3] = alpha
        else:
            result[..., 3] = 1
    return np.ascontiguousarray(result)


# Kept as a tested quantized renderer boundary, not the wire format.
def to_host(bgra, output, encoding):
    import numpy as np
    rgba = bgra[0][..., [2, 1, 0, 3]].astype(np.float32) / 65535.
    return compose(rgba[..., :3], rgba[..., 3], output, encoding)


class Engine:
    def __init__(self, runtime):
        import torch
        from corridorkey_mlx.mlx_backend import MLXModel
        from corridorkey_mlx.pipeline import encode_frame, checkerboard
        self.torch, self.encode_frame = torch, encode_frame
        self.model = MLXModel(runtime / 'models/fp16', 768, 1280, compile_graph=True)
        self.checker = checkerboard(720, 1280)

    def infer(self, rgba, screen, output, despill, encoding, policy=0,
              black=0., white=1., grow=0., softness=0.):
        import numpy as np
        import torch.nn.functional as F
        torch = self.torch
        if not np.isfinite(rgba).all():
            raise ValueError('Input contains non-finite pixels')
        if np.any(rgba[..., 3] < .99999) or np.any(rgba[..., 3] > 1.00001):
            raise ValueError('Use an opaque source before keying; input alpha is not supported')
        shape = rgba.shape[:2]
        if policy == 1 and shape != (HEIGHT, WIDTH):
            raise ValueError('Strict policy requires 1280x720')
        display_rgb = to_display(rgba[..., :3], encoding)
        canvas, box = fit_frame(display_rgb)
        bgr = np.ascontiguousarray(np.rint(canvas[..., ::-1] * 65535).astype(np.uint16))
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
            prediction = self.model.stage2(rgb_tensor, stage1['baton'].to(torch.float16).float())
            meta = dict(model_native_hw=(720, 1280), output_hw=(720, 1280), pad=(0, 0, 24, 0),
                        despill_strength=despill, screen=('green', 'blue')[screen])
            outputs = {'cutout', 'raw_fg'} if output == 2 else {'cutout'}
            rendered = self.model._render_predictions(meta, outputs, self.checker, prediction[0])
            rgba_model = rendered['cutout'][0][..., [2, 1, 0, 3]].astype(np.float32) / 65535.
            if output == 2:
                foreground = rendered['raw_fg'][0][..., [2, 1, 0]].astype(np.float32) / 65535.
            else:
                foreground = rgba_model[..., :3]
            foreground = restore_frame(foreground, box, shape)
            alpha = refine_alpha(restore_frame(rgba_model[..., 3], box, shape), black, white, grow, softness)
            return compose(foreground, alpha, output, encoding)


def serve(runtime):
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
            width, height, screen, output, despill, encoding, policy, black, white, grow, softness = parse_header(header)
            pixels = read_exact(sys.stdin.buffer, width * height * 16)
            key = hashlib.sha256(header + pixels).digest()
            if key != cached_key:
                import numpy as np
                if engine is None:
                    engine = Engine(runtime)
                rgba = np.frombuffer(pixels, dtype='<f4').reshape(height, width, 4)
                cached_value = engine.infer(rgba, screen, output, despill, encoding, policy,
                                            black, white, grow, softness).tobytes()
                cached_key = key
            protocol.write(struct.pack('<II', 0, len(cached_value)))
            protocol.write(cached_value)
        except Exception as error:
            message = str(error).encode('utf-8', errors='replace')[:4096]
            print('CorridorKey OFX:', error, file=sys.stderr)
            protocol.write(struct.pack('<II', 1, len(message)))
            protocol.write(message)
            return


if __name__ == '__main__':
    runtime = Path.home() / 'Library/Application Support/CorridorKey-Resolve'
    if not (runtime / 'ready.json').is_file():
        raise SystemExit('Set up the licensed CorridorKey runtime before using this effect')
    serve(runtime)