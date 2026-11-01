#!/usr/bin/env python3
"""Grade the shipped JK render's hair toward the master's hair colour, deterministically.

The render came back with hair darker and greyer than the maid master. Re-rendering costs money
and drifts everything else, so this lifts the hair in CIELAB instead: a mask built from the hair's
own blue low-chroma pixels, a uniform lightness lift with a small chroma shift, and a feathered
edge so lineart, skin, blouse, skirt, stockings and the gold hardware are untouched.

The lift is uniform, so shading ratios inside the hair survive; only tone and hue move.

usage: hair_grade.py SRC OUT.png [--check TARGET.png]
"""
import argparse

import numpy as np
from PIL import Image
from scipy import ndimage

M = np.array([[0.4124564, 0.3575761, 0.1804375],
              [0.2126729, 0.7151522, 0.0721750],
              [0.0193339, 0.1191920, 0.9503041]])
MI = np.linalg.inv(M)
WP = np.array([0.95047, 1.0, 1.08883])

# Hair zones of the JK render (green-screen, 1344x2016) and the navy pieces that share its
# colour: the neckerchief's two tails and the waistband. Joined by centroid, never cut, so no
# strand is sliced by a rectangle.
ZONES = [(400, 80, 1010, 800), (120, 440, 640, 1000)]
NOT_HAIR = [(645, 565, 795, 705), (575, 715, 805, 795)]

# Match the master's head band, measured in the same band on both renders:
# master L 49.9 a 7.52 b -24.73, render L 45.5 a 6.00 b -22.14.
LIFT_L = 4.4
SHIFT_A = 1.5


def to_lab(rgb):
    c = rgb / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = lin @ M.T / WP
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return 116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])


def from_lab(L, A, B):
    fy = (L + 16) / 116
    f = np.stack([fy + A / 500, fy, fy - B / 200], axis=-1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * WP
    lin = np.clip(xyz @ MI.T, 0, 1)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    return np.clip(srgb * 255, 0, 255)


def hair_mask(rgb, min_size=1500, min_inside=0.7):
    L, A, B = to_lab(rgb)
    mx, mn = rgb.max(2), rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    pred = (B < -6) & (A < 16) & (L > 20) & (L < 88) & (sat < 0.5)
    pred &= ~((rgb[..., 1] > rgb[..., 0] + 30) & (rgb[..., 1] > rgb[..., 2] + 30))
    labels, count = ndimage.label(pred)
    sizes = ndimage.sum(pred, labels, range(1, count + 1))
    keep = np.zeros_like(pred)
    for index in range(1, count + 1):
        if sizes[index - 1] < min_size:
            continue
        ys, xs = np.where(labels == index)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        if not any(x0 >= a and x1 <= b and y0 >= c and y1 <= d for a, c, b, d in ZONES):
            continue
        inside = np.zeros(len(xs), bool)
        for a, c, b, d in ZONES:
            inside |= (xs >= a) & (xs <= b) & (ys >= c) & (ys <= d)
        if inside.mean() < min_inside:
            continue
        cx, cy = xs.mean(), ys.mean()
        if any(a <= cx <= b and c <= cy <= d for a, c, b, d in NOT_HAIR):
            continue
        keep |= labels == index
    return keep


def grade(rgb):
    L, A, B = to_lab(rgb)
    weight = ndimage.gaussian_filter(hair_mask(rgb).astype(np.float64), 2.5)
    # Dark hair needs the full blue push; the render's own highlights are already blue enough,
    # so the shift fades out around L 62 and never adds chroma to the speculars.
    shift_b = 0.6 * np.clip(-6.5 + 0.33 * np.maximum(0, L - 42.6), -6.5, 1.0)
    # Fade near the top of the range so no highlight is pushed into clipping.
    taper = np.clip((92.0 - L) / 10.0, 0, 1)
    out = from_lab(L + LIFT_L * weight * taper, A + SHIFT_A * weight, B + shift_b * weight)
    out[weight < 1e-3] = rgb[weight < 1e-3]
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("out")
    parser.add_argument("--check", help="compare against an existing PNG instead of writing")
    args = parser.parse_args()
    rgb = np.asarray(Image.open(args.src).convert("RGB")).astype(np.float64)
    out = np.round(grade(rgb)).astype(np.uint8)
    if args.check:
        other = np.asarray(Image.open(args.check).convert("RGB"))
        diff = np.abs(out.astype(int) - other.astype(int))
        print(f"max diff {diff.max()} mean {diff.mean():.4f}")
        return
    # PNG, not JPEG: the source is already lossy and a second encode would smear the lineart.
    Image.fromarray(out).save(args.out)


if __name__ == "__main__":
    main()
