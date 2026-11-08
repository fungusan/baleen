#!/usr/bin/env python3
"""Key a character render to alpha and export the shipped sizes.

Three backgrounds are supported. White masters (#fefefe) use a border-connected flood: only white
touching the image border is background, so white clothing and pale hair stay opaque. The page tone
is measured, and a pixel must sit within four levels of it and carry almost no tint to count as
page; on a white-haired drawing a looser threshold lets the flood tunnel into the hair through its
pale strands. `--floor-shadow` additionally removes a soft ground shadow: it is a neutral, smooth
gradient (often dithered), so it is keyed by connectivity and texture rather than by whiteness,
including the part cropped by the bottom edge. Green-screen renders use the green dominance over
the other channels, which naturally keys enclosed pockets between limbs. Edge pixels are unblended
from the measured background colour before the final alpha is applied, which removes the fringe an
ordinary chroma key leaves behind. A render that already carries transparency is used as-is
(`--bg alpha`), with no unblending.

usage: key_art.py SRC FULL_OUT [--head HEAD_OUT] [--green GREEN_OUT] [--max-w 800] [--max-h 1200]
                         [--bg white|green|alpha] [--floor-shadow]
"""
import argparse

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage


def background_mask(rgb: np.ndarray, floor_shadow: bool = False) -> np.ndarray:
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(np.float32)
    page_lum = float(np.median(border.mean(axis=1)))
    page_chroma = float(np.median(border.max(axis=1) - border.min(axis=1)))
    white_floor = max(238.0, page_lum - 4.0)
    white_ceiling = max(6.0, page_chroma + 2.0)
    whiteish = (rgb.min(axis=2) >= white_floor) & (
        (rgb.max(axis=2) - rgb.min(axis=2)) <= white_ceiling
    )
    # White visible through closed hair loops never reaches the border, so it has to be keyed by
    # region. Every such pocket is small; a larger enclosed white is clothing and must stay.
    labels, count = ndimage.label(whiteish)
    edges = np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    touching = set(np.unique(edges)) - {0}
    sizes = ndimage.sum(whiteish, labels, range(1, count + 1))
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    blue = rgb[..., 2].astype(np.int16) - np.maximum(rgb[..., 0], rgb[..., 1]).astype(np.int16)
    pocket_ids = np.zeros(count + 1, bool)
    protected_ids = np.zeros(count + 1, bool)
    for index in range(1, count + 1):
        if index in touching or sizes[index - 1] < 100:
            continue
        region = labels == index
        ring = ndimage.binary_dilation(region, iterations=6) & ~ndimage.binary_dilation(region, iterations=2)
        ring_chroma = (chroma[ring] > 40).mean()
        ring_blue = ((blue > 6) & ring).sum() / ring.sum()
        if ring_chroma >= 0.45:
            pocket_ids[index] = True
        elif sizes[index - 1] >= 1500 and ring_blue < 0.45:
            # A big enclosed white with a neutral ring is paper or fabric, not a gap: keep it out
            # of the growth pass so the border flood cannot cross into it through a thin outline.
            protected_ids[index] = True
    pockets = pocket_ids[labels]
    whiteish &= ~protected_ids[labels]
    whiteish |= pockets

    # Grow the white by one pixel: it closes diagonal gaps between hair strands so enclosed
    # background pockets join the outer region, and it eats the pale anti-aliased rim.
    grown = np.asarray(Image.fromarray(np.where(whiteish, 255, 0).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(3)))
    mask = Image.fromarray(grown, "L").copy()
    width, height = mask.size
    pixels = mask.load()
    seeds = (
        [(x, 0) for x in range(width)]
        + [(x, height - 1) for x in range(width)]
        + [(0, y) for y in range(height)]
        + [(width - 1, y) for y in range(height)]
    )
    for seed in seeds:
        if pixels[seed] == 255:
            ImageDraw.floodfill(mask, seed, 128, thresh=0)
    background = (np.asarray(mask) == 128) | pockets
    if floor_shadow:
        background = remove_floor_shadow(rgb, background)
    return background


def remove_floor_shadow(rgb: np.ndarray, background: np.ndarray) -> np.ndarray:
    """Erase a soft neutral ground shadow without touching the figure standing in it."""
    rgb_f = rgb.astype(np.float32)
    lum = rgb_f.mean(axis=2)
    chroma = rgb_f.max(axis=2) - rgb_f.min(axis=2)
    # The shadow is a dithered gradient; judge smoothness on a despeckled copy so the dither does
    # not read as texture and fence the shadow out. Fabric keeps real folds and line art, so the
    # smooth-neutral region stays disconnected from the pale clothing that touches the page.
    smooth_lum = ndimage.median_filter(lum, 3)
    mean = ndimage.uniform_filter(smooth_lum, 5, mode="nearest")
    std = np.sqrt(
        np.maximum(ndimage.uniform_filter(smooth_lum * smooth_lum, 5, mode="nearest") - mean * mean, 0)
    )
    soft = (chroma <= 18) & (lum >= 193) & (std <= 2.5)
    radius = 2
    yy, xx = np.mgrid[-radius : radius + 1, -radius : radius + 1]
    soft = ndimage.binary_closing(soft, structure=(xx * xx + yy * yy) <= radius * radius)

    labels, _ = ndimage.label(background | soft)
    background_ids = set(np.unique(labels[background])) - {0}
    result = np.isin(labels, list(background_ids))

    # The shadow is cropped by the bottom edge, so its ridges can fence it off from the page.
    # Flood the bottom band over neutral, non-dark pixels: the navy boots stop the flood, while
    # the shadow and its ripples go. The band excludes the skirt hem and every pale garment.
    height = lum.shape[0]
    band = np.zeros(lum.shape, bool)
    band[-round(height * 0.05) :, :] = True
    neutral = (chroma <= 24) & (lum >= 140) & band
    seeds = np.zeros_like(neutral)
    seeds[-1, :] = neutral[-1, :]
    floor_labels, _ = ndimage.label(neutral)
    floor_ids = set(np.unique(floor_labels[seeds])) - {0}
    result |= np.isin(floor_labels, list(floor_ids))

    # Stray bright flecks of the shadow just above the band: drop isolated small islands without
    # touching the outfit's glitter, which sits higher up the figure.
    low = np.zeros(lum.shape, bool)
    low[-round(height * 0.12) :, :] = True
    fleck_labels, fleck_count = ndimage.label(~result)
    fleck_sizes = ndimage.sum(~result, fleck_labels, range(1, fleck_count + 1))
    fleck_boxes = ndimage.find_objects(fleck_labels)
    for index in range(1, fleck_count + 1):
        if fleck_sizes[index - 1] > 220:
            continue
        row, column = fleck_boxes[index - 1]
        region = fleck_labels[row, column] == index
        if not (low[row, column] & region).any():
            continue
        if lum[row, column][region].mean() >= 205 and chroma[row, column][region].mean() <= 20:
            result[row, column] |= region
    return result


def green_matte(rgb: np.ndarray):
    """Alpha from how far each pixel departs from the green screen, plus the measured screen colour."""
    f = rgb.astype(np.float32)
    border = np.concatenate([f[0], f[-1], f[:, 0], f[:, -1]])
    bg = np.median(border, axis=0)
    dominance = f[..., 1] - np.maximum(f[..., 0], f[..., 2])
    screen = max(12.0, float(bg[1] - max(bg[0], bg[2])))
    level = np.clip(dominance / screen, 0.0, 1.0)
    # A fully green pixel is 0; pale fabric carrying a little spill sits below the knee and stays
    # opaque. The smooth step keeps anti-aliased edges at a plausible partial coverage.
    t = np.clip((level - 0.15) / 0.85, 0.0, 1.0)
    alpha = 1.0 - t * t * (3.0 - 2.0 * t)
    alpha[alpha < 0.03] = 0.0
    return alpha.astype(np.float32), bg


def export(
    src: str,
    full_out: str,
    head_out: str | None,
    green_out: str | None,
    max_w: int,
    max_h: int,
    bg: str = "white",
    fit_h: int | None = None,
    floor_shadow: bool = False,
):
    if bg == "alpha":
        rgba = Image.open(src).convert("RGBA")
        rgb = np.asarray(rgba.convert("RGB"))
        coverage = np.asarray(rgba.getchannel("A")).astype(np.float32) / 255.0
        # A supplied cut-out was lifted off a white page, so a flat-white band survives along the
        # whole silhouette and as slivers inside closed hair loops. Judge white by the alpha mask
        # rather than the whole image: the transparent area's white otherwise connects everything
        # and the flood eats the ruffles. Flatness is the real discriminator — fabric white (apron,
        # ruffles, tights) always carries shading, background white is a single tone.
        inside = coverage > 0.2
        minimum = rgb.min(axis=2).astype(np.int16)
        chroma = rgb.max(axis=2).astype(np.int16) - minimum
        flat = (minimum >= 245) & (chroma <= 8)
        labels, count = ndimage.label(flat)
        remove = np.zeros_like(flat)
        if count:
            # The band is continuous around the figure, so seed the flood from the silhouette edge.
            seeded = flat & ndimage.binary_dilation(~inside, iterations=3)
            rim = np.unique(labels[seeded])
            rim = rim[rim != 0]
            remove = np.isin(labels, rim)
            luminance = rgb.astype(np.float32).mean(axis=2)
            sizes = ndimage.sum(flat, labels, range(1, count + 1))
            means = ndimage.mean(luminance, labels, range(1, count + 1))
            spreads = ndimage.standard_deviation(luminance, labels, range(1, count + 1))
            boxes = ndimage.find_objects(labels)
            for index in range(1, count + 1):
                if index in rim or sizes[index - 1] > 40000:
                    continue
                if means[index - 1] < 244 or spreads[index - 1] > 3.0:
                    continue
                # Only a pocket ringed by hair is background showing through; flat patches of the
                # blouse or apron sit inside white shading and must stay.
                row, column = boxes[index - 1]
                y0, y1 = max(0, row.start - 6), min(labels.shape[0], row.stop + 6)
                x0, x1 = max(0, column.start - 6), min(labels.shape[1], column.stop + 6)
                region = labels[y0:y1, x0:x1] == index
                ring = ndimage.binary_dilation(region, iterations=6) & ~ndimage.binary_dilation(region, iterations=2)
                if not ring.any():
                    continue
                around = rgb[y0:y1, x0:x1].astype(np.int16)
                blue = around[..., 2] - np.maximum(around[..., 0], around[..., 1])
                if ((blue > 6) & ring).sum() / ring.sum() >= 0.45:
                    remove[y0:y1, x0:x1] |= region
        coverage = np.where(remove, 0.0, coverage).astype(np.float32)
        # The cut-out is white-composited, so partial pixels still carry the page white. Unblend
        # it instead of copying a neighbour's colour, which smeared dark lineart into the edge.
        source = rgb.astype(np.float32)
        partial = (coverage > 0.05) & (coverage < 0.95)
        if partial.any():
            unblended = (source - (1.0 - coverage[..., None]) * 255.0) / np.clip(coverage[..., None], 0.05, 1.0)
            rgb = np.where(partial[..., None], np.clip(unblended, 0, 255), source)
        else:
            rgb = source
        bg_color = None
    else:
        image = Image.open(src).convert("RGB")
        rgb = np.asarray(image)
        if bg == "green":
            coverage, bg_color = green_matte(rgb)
        else:
            background = background_mask(rgb, floor_shadow)
            coverage = (~background).astype(np.float32)
            # A supplied page is not always #ffffff (this one sits at 246,244,245). Measure it so
            # the edge unblend does not subtract ten levels too much and leave a dark rim.
            bg_color = np.median(
                np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(np.float32), axis=0
            )

    solid = coverage > 0.35
    ys, xs = np.where(solid)
    if not len(ys):
        raise SystemExit(f"{src}: no foreground found")
    pad = 8 if bg == "green" else 4
    y0, y1 = max(0, ys.min() - pad), min(rgb.shape[0], ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(rgb.shape[1], xs.max() + 1 + pad)
    rgb = rgb[y0:y1, x0:x1]
    coverage = coverage[y0:y1, x0:x1]

    # Generated poses come back square, so width-fitting would shrink the girl beside a portrait
    # master. Normalise by height instead; a hair tip grazing the canvas edge beats a 30% bob.
    if bg in ("green", "alpha"):
        scale = (max_h - 40) / rgb.shape[0]
    else:
        scale = min(max_w / rgb.shape[1], max_h / rgb.shape[0])
    size = (round(rgb.shape[1] * scale), round(rgb.shape[0] * scale))
    if bg == "alpha":
        # Resize premultiplied: resampling colour and alpha separately pulls the nearly invisible
        # rim pixels' colour into the edge and leaves a fringe.
        premultiplied = (rgb.astype(np.float32) * coverage[..., None]).clip(0, 255).astype(np.uint8)
        premultiplied = np.asarray(Image.fromarray(premultiplied).resize(size, Image.LANCZOS)).astype(np.float32)
        alpha = np.asarray(Image.fromarray((coverage * 255).astype(np.uint8), "L").resize(size, Image.LANCZOS))
        alpha = alpha.astype(np.float32) / 255.0
        foreground = np.clip(premultiplied / np.clip(alpha, 1e-3, 1.0)[..., None], 0, 255)
    else:
        rgb_img = Image.fromarray(rgb).resize(size, Image.LANCZOS)
        alpha = np.asarray(Image.fromarray((coverage * 255).astype(np.uint8), "L").resize(size, Image.LANCZOS))
        alpha = alpha.astype(np.float32) / 255.0
        # Unblend the background the edge pixels were composited over, then soften the matte edge.
        safe = np.clip(alpha, 0.04, 1.0)[..., None]
        foreground = np.clip((np.asarray(rgb_img).astype(np.float32) - (1 - safe) * bg_color) / safe, 0, 255)
    matte = np.asarray(
        Image.fromarray((alpha * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.5))
    ).astype(np.float32)
    if bg == "green":
        # The palette has no true greens, so wherever green leads the other channels the pixel is
        # carrying screen spill (thin hair strands keep it even at full alpha): clamp it back.
        cap = np.maximum(foreground[..., 0], foreground[..., 2])
        foreground[..., 1] = np.minimum(foreground[..., 1], cap)
    out = np.dstack([np.where(matte[..., None] > 0, foreground, 0), matte]).astype(np.uint8)
    figure = Image.fromarray(out, "RGBA")

    # Every pose of a character must draw her at the same size, or the overlay breathes between
    # states. Scaling to one shared height keeps the boots on the canvas edge for all of them.
    if fit_h:
        # Frame on solid pixels only: faint fringe at the edges would otherwise make one state
        # measure taller than another and draw her at a different size.
        coverage = np.asarray(figure.getchannel("A")).astype(np.float32) / 255.0
        ys, xs = np.nonzero(coverage > 0.35)
        if len(ys):
            figure = figure.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
            width = max(1, round(figure.width * fit_h / figure.height))
            figure = figure.convert("RGBa").resize((width, fit_h), Image.LANCZOS).convert("RGBA")

    # Every pose shares one canvas, feet on the bottom edge, so crossfades never resize or bob.
    full = Image.new("RGBA", (max_w, max_h), (0, 0, 0, 0))
    if figure.width > max_w:
        left = (figure.width - max_w) // 2
        figure = figure.crop((left, 0, left + max_w, figure.height))
    full.alpha_composite(figure, ((max_w - figure.width) // 2, max_h - figure.height))
    full.save(full_out, "WEBP", quality=92, method=6)

    if green_out:
        plate = Image.new("RGBA", full.size, (0, 255, 0, 255))
        plate.alpha_composite(full)
        plate.convert("RGB").save(green_out, "JPEG", quality=95)

    if head_out:
        side = min(256, full.width, full.height)
        left = max(0, full.width // 2 - side // 2)
        full.crop((left, 0, left + side, side)).save(head_out, "WEBP", quality=92, method=6)

    print(f"{full_out} {full.width}x{full.height}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("full_out")
    parser.add_argument("--head")
    parser.add_argument("--green")
    parser.add_argument("--max-w", type=int, default=800)
    parser.add_argument("--max-h", type=int, default=1200)
    parser.add_argument("--bg", choices=("white", "green", "alpha"), default="white")
    parser.add_argument("--fit-h", type=int, default=0, help="scale the figure to this height in pixels")
    parser.add_argument(
        "--floor-shadow",
        action="store_true",
        help="remove a soft ground shadow from a white-page render",
    )
    args = parser.parse_args()
    export(
        args.src,
        args.full_out,
        args.head,
        args.green,
        args.max_w,
        args.max_h,
        args.bg,
        args.fit_h or None,
        args.floor_shadow,
    )


if __name__ == "__main__":
    main()
