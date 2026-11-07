#!/usr/bin/env python3
"""Deterministic QA for a character render against the approved master.

Prints the numbers the art workflow gates on, so a candidate is judged the same way every time:
frame margins, figure aspect, head-band render detail and per-band Lab medians. It only reads the
renders. Proportions (waist, skirt hem) are measured separately with an outfit colour probe — a
silhouette heuristic cannot tell a tail from a leg.

usage:
  art_qa.py --render candidate.jpg --master art-src/baleen/raw/master-idle-v2.png
  art_qa.py --render candidate.png --master master.png --bg alpha --json qa.json --strict
"""
import argparse
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

GATES = {
    'margin': 2,          # px of clear background on every side
    'aspect': 0.03,       # absolute figure-aspect delta vs master
    'detail': 0.85,       # head-band detail energy vs master
    'band_de': 8.0,       # Lab dE per 20% body band before it is flagged
}


def load(path):
    return np.asarray(Image.open(path).convert('RGBA'))


def white_background(rgb):
    """White pixels connected to the border are background; enclosed white clothing stays."""
    whiteish = (rgb.min(axis=2) >= 245) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= 8)
    labels, _ = ndimage.label(whiteish)
    border = np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    return np.isin(labels, np.unique(border[border > 0]))


def figure_mask(rgba, bg):
    rgb = rgba[..., :3]
    if bg == 'auto':
        if (rgba[..., 3] < 250).any():
            bg = 'alpha'
        else:
            f = rgb.astype(np.int32)
            green = (f[..., 1] > 110) & (f[..., 1] > f[..., 0] * 1.6) & (f[..., 1] > f[..., 2] * 1.6)
            bg = 'green' if green.mean() > 0.08 else 'white'
    if bg == 'alpha':
        mask = rgba[..., 3] > 16
    elif bg == 'green':
        f = rgb.astype(np.int32)
        mask = ~((f[..., 1] > 110) & (f[..., 1] > f[..., 0] * 1.6) & (f[..., 1] > f[..., 2] * 1.6))
    else:
        mask = ~white_background(rgb)
    labels, count = ndimage.label(mask)
    if count:
        sizes = ndimage.sum(mask, labels, range(1, count + 1))
        keep = sizes >= max(64, sizes.max() * 0.001)
        mask = np.isin(labels, np.flatnonzero(keep) + 1)
    return mask, bg


def luma(rgb):
    rgb = rgb.astype(np.float64)
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def lab(rgb):
    rgb = rgb.astype(np.float64) / 255.0
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    matrix = np.array(
        [[0.4124564, 0.3575761, 0.1804375],
         [0.2126729, 0.7151522, 0.0721750],
         [0.0193339, 0.1191920, 0.9503041]]
    )
    xyz = lin @ matrix.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16.0 / 116.0)
    return np.stack([116.0 * f[..., 1] - 16.0, 500.0 * (f[..., 0] - f[..., 1]), 200.0 * (f[..., 1] - f[..., 2])], axis=-1)


def resize_rows(array, height, mode=Image.BILINEAR):
    width = max(1, round(array.shape[1] * height / array.shape[0]))
    return np.asarray(Image.fromarray(array).resize((width, height), mode), dtype=np.float64)


def detail_energy(rgba, mask, bbox, fraction, target_h=400):
    x0, y0, x1, y1 = bbox
    height = y1 - y0 + 1
    bottom = y0 + max(2, int(fraction * height))
    gray = luma(rgba[y0:bottom, x0:x1 + 1])
    solid = (mask[y0:bottom, x0:x1 + 1] * 255).astype(np.uint8)
    gray = resize_rows(gray.astype(np.uint8), target_h)
    solid = resize_rows(solid, target_h) > 127
    solid = ndimage.binary_erosion(solid, iterations=2)
    if not solid.any():
        return {'gradient': 0.0, 'local_std': 0.0}
    gy, gx = np.gradient(gray)
    gradient = np.hypot(gx, gy)[solid].mean()
    mean = ndimage.uniform_filter(gray, 9)
    spread = np.sqrt(np.maximum(ndimage.uniform_filter(gray ** 2, 9) - mean ** 2, 0))
    return {'gradient': float(gradient), 'local_std': float(spread[solid].mean())}


def measure(rgba, bg):
    mask, bg = figure_mask(rgba, bg)
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    x0, x1, y0, y1 = cols[0], cols[-1], rows[0], rows[-1]
    height = y1 - y0 + 1
    width = x1 - x0 + 1
    bands = []
    for lo in (0.0, 0.2, 0.4, 0.6, 0.8):
        top = y0 + int(lo * height)
        bottom = y0 + int(min(1.0, lo + 0.2) * height)
        pixels = rgba[top:bottom, x0:x1 + 1, :3].reshape(-1, 3)[mask[top:bottom, x0:x1 + 1].reshape(-1)]
        bands.append(np.median(lab(pixels), axis=0).round(2).tolist() if len(pixels) else None)
    return {
        'size': [int(rgba.shape[1]), int(rgba.shape[0])],
        'background': bg,
        'bbox': [int(x0), int(y0), int(x1), int(y1)],
        'aspect': round(width / height, 4),
        'margins': [int(x0), int(y0), int(rgba.shape[1] - 1 - x1), int(rgba.shape[0] - 1 - y1)],
        'detail': detail_energy(rgba, mask, (x0, y0, x1, y1), 0.22),
        'bands': bands,
    }


def delta(current, master):
    d = {}
    d['aspect'] = round(current['aspect'] - master['aspect'], 4)
    d['detail_gradient'] = round(current['detail']['gradient'] / master['detail']['gradient'], 4)
    d['detail_local_std'] = round(current['detail']['local_std'] / master['detail']['local_std'], 4)
    d['bands'] = []
    for band, reference in zip(current['bands'], master['bands']):
        if band is None or reference is None:
            d['bands'].append(None)
        else:
            d['bands'].append(round(float(np.linalg.norm(np.subtract(band, reference))), 2))
    return d


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--render', required=True)
    parser.add_argument('--master')
    parser.add_argument('--bg', choices=['auto', 'alpha', 'green', 'white'], default='auto')
    parser.add_argument('--json')
    parser.add_argument('--strict', action='store_true')
    parser.add_argument('--bands', action='store_true', help='gate per-band Lab dE (same-outfit re-renders only)')
    options = parser.parse_args()

    render = measure(load(options.render), options.bg)
    master = measure(load(options.master), options.bg) if options.master else None
    diff = delta(render, master) if master else None

    print(f"render  {options.render}  {render['size'][0]}x{render['size'][1]}  bg={render['background']}")
    print(f"figure  {render['bbox'][2] - render['bbox'][0] + 1}x{render['bbox'][3] - render['bbox'][1] + 1}"
          f"  aspect {render['aspect']}  margins {'/'.join(map(str, render['margins']))}")
    print(f"head detail  gradient {render['detail']['gradient']:.2f}  local std {render['detail']['local_std']:.2f}")
    for band, value in zip(('0-20%', '20-40%', '40-60%', '60-80%', '80-100%'), render['bands']):
        if value:
            print(f"band {band:>7}  L {value[0]:6.1f}  a {value[1]:5.1f}  b {value[2]:6.1f}")

    failed = []
    # The master may be a tight cut-out; only a render on a canvas wider than the master can clip.
    if min(render['margins']) < GATES['margin'] and (not master or min(master['margins']) >= GATES['margin']):
        failed.append(f"figure touches the frame (margins {render['margins']})")
    if master:
        print(f"master  {options.master}  aspect {master['aspect']}")
        print(f"delta   aspect {diff['aspect']:+.3f}  detail x{diff['detail_gradient']:.2f} / local x{diff['detail_local_std']:.2f}")
        for band, value in zip(('0-20%', '20-40%', '40-60%', '60-80%', '80-100%'), diff['bands']):
            print(f"band dE {band:>7}  {value if value is not None else '-'}")
        if abs(diff['aspect']) > GATES['aspect']:
            failed.append(f"aspect moved {diff['aspect']:+.3f} (limit ±{GATES['aspect']})")
        if diff['detail_gradient'] < GATES['detail']:
            failed.append(f"head detail x{diff['detail_gradient']:.2f} (gate ≥{GATES['detail']})")
        if options.bands:
            for band, value in zip(('0-20%', '20-40%', '40-60%', '60-80%', '80-100%'), diff['bands']):
                if value is not None and value > GATES['band_de']:
                    failed.append(f"band {band} dE {value} (limit {GATES['band_de']})")

    if options.json:
        with open(options.json, 'w', encoding='utf-8') as handle:
            json.dump({'render': render, 'master': master, 'delta': diff, 'failed': failed}, handle, indent=2)
        print(f"wrote {options.json}")
    if failed:
        print('FAIL')
        for reason in failed:
            print(f"  - {reason}")
        if options.strict:
            sys.exit(1)
    else:
        print('PASS')


if __name__ == '__main__':
    main()
