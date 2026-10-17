"""
Rebuilds the brand and icon assets in /public from the originals in
design-assets/source. Run from the project root:

    python scripts/build-assets.py

Requires: Pillow, numpy.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design-assets" / "source"
PUB = ROOT / "public"
APP = ROOT / "src" / "app"

BRAND = (194, 65, 12)  # primary orange, #C2410C
FOREST = BRAND  # app icon background
WHITE = (255, 255, 255)


def trim(im: Image.Image, pad: int = 0, thresh: int = 8) -> Image.Image:
    a = np.array(im.split()[-1])
    ys, xs = np.where(a > thresh)
    box = (
        max(xs.min() - pad, 0),
        max(ys.min() - pad, 0),
        min(xs.max() + 1 + pad, im.width),
        min(ys.max() + 1 + pad, im.height),
    )
    return im.crop(box)


def fit_width(im: Image.Image, w: int) -> Image.Image:
    h = round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)


# --------------------------------------------------------------------------
# Logo: remove the near-white background, keep the green artwork.
# --------------------------------------------------------------------------
def logo_layers():
    raw = np.array(Image.open(SRC / "logo-original.png").convert("RGB")).astype(float)
    r = raw[..., 0]
    # Every colour in the logo is a green with a low red channel, so the red
    # channel tells us how much ink sits on top of the white background.
    alpha = np.clip((255.0 - r) / 243.0, 0, 1)
    alpha[alpha < 0.03] = 0
    a3 = alpha[..., None]
    safe = np.where(a3 > 0, a3, 1)
    colour = np.clip((raw - (1 - a3) * 255.0) / safe, 0, 255)
    rgba = np.dstack([colour, alpha * 255.0]).astype(np.uint8)
    colour_im = Image.fromarray(rgba, "RGBA")
    # v2 theme: the supplied artwork is green, so recolour it to the orange
    # brand by replacing the hue and keeping the original light and dark tones.
    hsv = np.array(colour_im.convert("RGB").convert("HSV")).astype(float)
    hsv[..., 0] = 17.0 / 360.0 * 255.0
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.05, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * 1.55 + 20, 0, 255)
    shifted = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
    rgba2 = np.dstack([np.array(shifted), rgba[..., 3]]).astype(np.uint8)
    colour_im = Image.fromarray(rgba2, "RGBA")

    white = np.dstack([np.full_like(r, 255), np.full_like(r, 255), np.full_like(r, 255), alpha * 255.0]).astype(
        np.uint8
    )
    white_im = Image.fromarray(white, "RGBA")
    return colour_im, white_im


def band(im: Image.Image, y0: int, y1: int) -> Image.Image:
    return trim(im.crop((0, y0, im.width, y1 + 1)), pad=2)


def build_logo():
    colour, white = logo_layers()
    out = PUB / "brand"
    out.mkdir(parents=True, exist_ok=True)

    # Bands measured from the original 1254 x 1254 artwork.
    bands = {
        "mark": (219, 729),
        "wordmark": (763, 928),
    }
    full_colour = trim(colour.crop((0, 200, colour.width, 1050)), pad=4)
    full_white = trim(white.crop((0, 200, white.width, 1050)), pad=4)
    fit_width(full_colour, 900).save(out / "logo-full.png", optimize=True)
    fit_width(full_white, 900).save(out / "logo-full-white.png", optimize=True)

    for name, (y0, y1) in bands.items():
        c = band(colour, y0, y1)
        w = band(white, y0, y1)
        width = 512 if name == "mark" else 720
        fit_width(c, width).save(out / f"logo-{name}.png", optimize=True)
        fit_width(w, width).save(out / f"logo-{name}-white.png", optimize=True)

    # Icon-only mark used for app icons.
    mark_white = band(white, *bands["mark"])
    return mark_white


def app_icon(mark_white: Image.Image, size: int, scale: float, rounded: bool = False) -> Image.Image:
    bg = Image.new("RGBA", (size, size), FOREST + (255,))
    m = mark_white.copy()
    target = int(size * scale)
    ratio = min(target / m.width, target / m.height)
    m = m.resize((round(m.width * ratio), round(m.height * ratio)), Image.LANCZOS)
    bg.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
        bg.putalpha(mask)
    return bg


def build_app_icons(mark_white: Image.Image):
    icons = PUB / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    app_icon(mark_white, 192, 0.62).save(icons / "icon-192.png", optimize=True)
    app_icon(mark_white, 512, 0.62).save(icons / "icon-512.png", optimize=True)
    # Maskable icons keep the artwork inside the central 80 % safe zone.
    app_icon(mark_white, 512, 0.5).save(icons / "maskable-512.png", optimize=True)
    app_icon(mark_white, 180, 0.62).save(icons / "apple-touch-icon.png", optimize=True)
    APP.mkdir(parents=True, exist_ok=True)
    app_icon(mark_white, 64, 0.66, rounded=True).save(APP / "icon.png", optimize=True)
    app_icon(mark_white, 180, 0.62).save(APP / "apple-icon.png", optimize=True)
    app_icon(mark_white, 48, 0.7).save(PUB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


# --------------------------------------------------------------------------
# Landing photographs. The supplied images carry a baked-in logo at the top
# (and, for the third, a headline at the bottom). The page draws its own logo
# and headline, so those regions are cropped away here.
# --------------------------------------------------------------------------
LANDING = [
    ("landing-1-manager.png", "hero-manager.jpg", 250, None),
    ("landing-2-customers.png", "hero-customers.jpg", 250, None),
    ("landing-3-growth.png", "hero-growth.jpg", 250, 1100),
]


def build_landing():
    out = PUB / "landing"
    out.mkdir(parents=True, exist_ok=True)
    for src, dst, top, bottom in LANDING:
        im = Image.open(SRC / src).convert("RGB")
        im = im.crop((0, top, im.width, bottom or im.height))
        im.save(out / dst, quality=82, optimize=True, progressive=True)
    kitchen = Image.open(SRC / "login-header-kitchen.png").convert("RGB")
    fit_width(kitchen, 1400).save(out / "login-header.jpg", quality=82, optimize=True, progressive=True)


# --------------------------------------------------------------------------
# Glyph icons (supplied black icons) -> transparent PNG masks that the app
# recolours with CSS, so they follow the palette tokens.
# --------------------------------------------------------------------------
GLYPHS = {
    "icon-waiter.png": ("role-waiter.png", 0),
    "icon-kitchen.png": ("role-kitchen.png", 0),
    "icon-cashier.png": ("role-cashier.png", 0),
    "icon-manager-workflow.png": ("role-manager.png", 0),
    "icon-team.png": ("team.png", 0),
    "icon-table.png": ("table.png", 4),
}


def glyph_to_mask(path: Path, border: int) -> Image.Image:
    im = Image.open(path)
    if border:
        im = im.crop((border, border, im.width - border, im.height - border))
    has_alpha = im.mode == "RGBA" and np.array(im.split()[-1]).min() < 250
    if has_alpha:
        alpha = np.array(im.split()[-1]).astype(float) / 255.0
    else:
        gray = np.array(im.convert("L")).astype(float)
        # Black ink -> 1, white and the light-grey preview checkerboard -> 0.
        alpha = np.clip((175.0 - gray) / (175.0 - 90.0), 0, 1)
    out = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    mask = trim(Image.fromarray(out, "RGBA"), pad=0, thresh=20)
    side = max(mask.size)
    pad = int(side * 0.04)
    sq = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    sq.alpha_composite(mask, ((sq.width - mask.width) // 2, (sq.height - mask.height) // 2))
    return sq.resize((256, 256), Image.LANCZOS)


def build_glyphs():
    out = PUB / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for src, (dst, border) in GLYPHS.items():
        glyph_to_mask(SRC / src, border).save(out / dst, optimize=True)


if __name__ == "__main__":
    mark = build_logo()
    build_app_icons(mark)
    build_landing()
    build_glyphs()
    print("assets rebuilt")
