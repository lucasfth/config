"""Deterministic CPU studies adapted from Astrobubu/dithering-shader (MIT).

See LICENSE-Astrobubu.txt. These are adaptations, not exact WebGL captures.
"""

from functools import lru_cache

import numpy as np

STYLES = {
    "blackhole-circle": "peach",
    "eclipse": "lavender",
    "orbital-horizon": "sky",
    "torus": "mauve",
}


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def torus(x, y):
    # Vectorized version of the reference's signed-distance ray marcher.
    ray = np.stack((x * .92, y * .92, np.full_like(x, -1.85)), axis=-1)
    ray /= np.linalg.norm(ray, axis=-1, keepdims=True)
    origin = np.array([0., 0., 3.2])
    # Tilt the torus plane toward the camera: the old near-edge-on view
    # collapsed its opening into a pointed slit.
    tilt = 1.10
    roll = -.35

    def sdf(p):
        px = np.cos(roll) * p[..., 0] - np.sin(roll) * p[..., 1]
        py = np.sin(roll) * p[..., 0] + np.cos(roll) * p[..., 1]
        qy = np.cos(tilt) * py - np.sin(tilt) * p[..., 2]
        qz = np.sin(tilt) * py + np.cos(tilt) * p[..., 2]
        return np.hypot(np.hypot(px, qz) - .72, qy) - .21

    travel = np.zeros_like(x)
    hit = np.zeros_like(x, dtype=bool)
    for _ in range(48):
        distance = sdf(origin + ray * travel[..., None])
        hit |= (np.abs(distance) < .0025) & (travel <= 6)
        active = ~hit & (travel <= 6)
        travel += np.where(active, np.maximum(distance, .001) * .78, 0)
        if not active.any():
            break
    position = origin + ray * travel[..., None]
    normal = np.stack([sdf(position + axis * .004) - sdf(position - axis * .004)
                       for axis in np.eye(3)], axis=-1)
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-9)
    light = np.array([-.55, .72, .65])
    light /= np.linalg.norm(light)
    diffuse = (normal * light).sum(axis=-1) * .5 + .5
    rim = (1 - np.maximum(0, (normal * -ray).sum(axis=-1))) ** 2.2
    return np.clip(diffuse * .78 + rim * .48, 0, 1) * hit


@lru_cache(maxsize=4)
def field(kind, width, height):
    if kind not in STYLES:
        raise ValueError(f"unknown style: {kind}")
    if width < 1 or height < 1:
        raise ValueError("image dimensions must be positive")
    # Evaluate once per three-pixel dither cell, not once per screen pixel.
    w, h = (width + 2) // 3, (height + 2) // 3
    yy, xx = np.mgrid[:h, :w].astype(float)
    portrait = height > width
    # Close-up, deliberately cropped: circles exceed screen height on desktop
    # and screen width on phone. Match composition in dark/light variants.
    span = 1.35 if portrait else 1.50
    unit = w if portrait else h
    x = (xx - w * (.65 if portrait else .68)) / unit * span
    y = (h * .60 - yy) / unit * span
    r = np.hypot(x, y)
    if kind == 'blackhole-circle':
        radius = .92
        outside = np.maximum(r - radius, 0)
        rim = np.exp(-outside * 62)
        corona = .30 * np.exp(-outside * 19)
        support = 1 - smooth(.10, .22, outside)
        # No angle-noise: it produced the conspicuous down-right plume.
        value = (rim + corona) * support * smooth(radius - .004, radius + .004, r)
    elif kind == 'eclipse':
        radius = .92
        outside = np.maximum(r - radius, 0)
        corona = np.exp(-outside * 23) * (1 - smooth(.10, .22, outside))
        sun = np.where(r <= radius, 1., corona)
        moon = np.hypot(x - .12, y - .055)
        value = sun * smooth(radius - .003, radius + .006, moon)
    elif kind == 'orbital-horizon':
        # A much closer planetary limb spans the frame, rather than a small cap.
        radius = 2.65
        dy = y + 2.63
        rr = np.hypot(x, dy)
        signed = rr - radius
        atmosphere = .70 * np.exp(-np.abs(signed) * 33)
        atmosphere *= 1 - smooth(.065, .14, np.abs(signed))
        inner_depth = np.maximum(-signed, 0)
        inner = .36 * np.exp(-inner_depth * 13) * (signed <= 0)
        inner *= 1 - smooth(.14, .30, inner_depth)
        value = atmosphere + inner
    else:
        value = torus(x * .47, y * .47)
    value = np.clip(value, 0, 1)
    # Ordered 8x8 Bayer texture shared by dark/light variants.
    bayer = np.array([[0, 2], [3, 1]])
    for _ in range(2):
        bayer = np.block([[4 * bayer, 4 * bayer + 2],
                          [4 * bayer + 3, 4 * bayer + 1]])
    threshold = (bayer[yy.astype(int) % 8, xx.astype(int) % 8] + .5) / 64
    # Break up coherent faint Bayer bands without adding low-frequency blobs.
    jitter = (np.sin(xx * 12.9898 + yy * 78.233) * 43758.5453) % 1
    threshold = np.clip(threshold + (jitter - .5) * .10, .002, .998)
    return value > threshold
