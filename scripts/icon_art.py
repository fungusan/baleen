#!/usr/bin/env python3
"""Key a green-screen icon render and export the toolbar sizes.

The key is the character pipeline's own: green dominance over the other channels, edge pixels
unblended from the measured screen colour, and green spill clamped, so the icon and her on-page
art read as the same drawing.

usage: icon_art.py SRC OUT_DIR [--sizes 16,32,48,128,256] [--pad 0.05] [--frame body|head] [--head OUT]
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from key_art import green_matte


def cut_out(src: Path) -> Image.Image:
    rgb = np.asarray(Image.open(src).convert("RGB"))
    coverage, bg_color = green_matte(rgb)
    ys, xs = np.where(coverage > 0.35)
    if not len(ys):
        raise SystemExit(f"{src}: no foreground found")
    # One pixel of bleed keeps the outermost anti-aliased rim on every side.
    y0, y1 = max(0, ys.min() - 1), min(rgb.shape[0], ys.max() + 2)
    x0, x1 = max(0, xs.min() - 1), min(rgb.shape[1], xs.max() + 2)
    rgb = rgb[y0:y1, x0:x1].astype(np.float32)
    coverage = coverage[y0:y1, x0:x1][..., None]

    safe = np.clip(coverage, 0.04, 1.0)
    foreground = np.clip((rgb - (1 - safe) * bg_color) / safe, 0, 255)
    cap = np.maximum(foreground[..., 0], foreground[..., 2])
    foreground[..., 1] = np.minimum(foreground[..., 1], cap)
    return Image.fromarray(np.rint(np.dstack([foreground, coverage * 255])).astype(np.uint8), "RGBA")


def square(figure: Image.Image, pad: float) -> Image.Image:
    side = max(figure.size)
    canvas = round(side / (1 - 2 * pad))
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.alpha_composite(figure, ((canvas - figure.width) // 2, (canvas - figure.height) // 2))
    return out


def resize(master: Image.Image, size: int) -> Image.Image:
    # Resample premultiplied: a shrinking silhouette otherwise drags the transparent pixels'
    # colour into its rim and leaves a grey halo.
    data = np.asarray(master).astype(np.float32)
    alpha = data[..., 3:4]
    premultiplied = np.dstack([data[..., :3] * alpha / 255.0, alpha])
    small = np.asarray(
        Image.fromarray(np.rint(premultiplied).clip(0, 255).astype(np.uint8), "RGBA").resize(
            (size, size), Image.LANCZOS
        )
    ).astype(np.float32)
    alpha = small[..., 3:4]
    safe = np.clip(alpha / 255.0, 1e-3, 1.0)
    rgb = np.clip(small[..., :3] / safe, 0, 255)
    return Image.fromarray(np.rint(np.dstack([rgb, alpha])).astype(np.uint8), "RGBA")


def head_crop(figure: Image.Image) -> Image.Image:
    """Square bust around the face: the whole head, both fins and the collar, no empty top.

    Framed from the drawing rather than fixed pixels: the head spans almost the full width of a
    chibi render, and its centre is the alpha centroid of the upper third.
    """
    alpha = np.asarray(figure.getchannel("A"))
    rows = alpha[int(0.15 * alpha.shape[0]) : int(0.35 * alpha.shape[0])] > 100
    xs = np.nonzero(rows)[1]
    centre = int(xs.mean())
    side = round(0.88 * figure.width)
    left = max(0, min(figure.width - side, centre - side // 2))
    return figure.crop((left, 0, left + side, side))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("out_dir")
    parser.add_argument("--sizes", default="16,32,48,128,256")
    parser.add_argument("--pad", type=float, default=0.05, help="empty margin on each side, as a fraction")
    parser.add_argument(
        "--frame",
        choices=("body", "head"),
        default="body",
        help="'head' fills the icon with the bust, which keeps the face readable at 16 px",
    )
    parser.add_argument("--head", help="also write a 256 px bust here")
    args = parser.parse_args()

    figure = cut_out(Path(args.src))
    master = square(head_crop(figure) if args.frame == "head" else figure, args.pad)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for size in (int(s) for s in args.sizes.split(",")):
        path = out_dir / f"{size}.png"
        resize(master, size).save(path, "PNG", optimize=True)
        print(f"{path} {size}x{size} {path.stat().st_size} bytes")

    if args.head:
        head = Path(args.head)
        head.parent.mkdir(parents=True, exist_ok=True)
        resize(head_crop(figure), 256).save(head, "PNG", optimize=True)
        print(f"{head} 256x256 {head.stat().st_size} bytes")


if __name__ == "__main__":
    main()
