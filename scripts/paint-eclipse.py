"""Render the two loading-screen plates. Requires NumPy and Pillow."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "images"
FRAMING = json.loads((ROOT / "src" / "eclipse-framing.json").read_text())
RANDOM = np.random.default_rng(74)
NOISE = RANDOM.uniform(-1, 1, (512, 512)).astype("float32")


def noise(x, y):
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - i, y - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = NOISE[j % 512, i % 512] * (1 - fx) + NOISE[j % 512, (i + 1) % 512] * fx
    b = NOISE[(j + 1) % 512, i % 512] * (1 - fx) + NOISE[(j + 1) % 512, (i + 1) % 512] * fx
    return a * (1 - fy) + b * fy


def terrain(x, z):
    peaks = [
        (-5.5, 8, 3.4, 1.0), (-3.0, 9.2, 2.65, 1.05), (-1.9, 10.5, 1.6, .98),
        (3.8, 7.5, 2.55, .83), (5.0, 7.9, 3.1, .94), (2.5, 10, 1.75, .85),
        (-1.35, 13, 1.28, .76), (1.4, 13, 1.35, .96),
        (.1, 18, 1.10, .74), (-2.3, 3.5, .9, .78), (2.7, 4.5, .82, .55),
    ]
    twist = noise(x * 1.25, z * 1.25) * .18
    height = np.full_like(x, -.4)
    for px, pz, altitude, slope in peaks:
        dx, dz = x - px + twist, z - pz
        distance = np.sqrt(dx * dx + dz * dz * .64) + .18 * abs(dx - dz * .4)
        height = np.maximum(height, altitude - distance * slope)
    return (height + .23 * noise(x * 2.3, z * 2.3) + .09 * noise(x * 7, z * 7)
            + .035 * noise(x * 20, z * 20) + .012 * noise(x * 61, z * 61))


def paint(width, height, portrait):
    rng = np.random.default_rng(129 if portrait else 73)
    y, x = np.mgrid[:height, :width]
    u, v = x / width, y / height
    horizon = int(height * FRAMING["horizon"])
    moon = FRAMING["portrait" if portrait else "landscape"]
    moon_x, moon_y = width * moon["x"], height * FRAMING["moonY"]
    radius = height * moon["radius"]
    mx, my = (x - moon_x) / radius, (y - moon_y) / radius
    distance, angle = np.hypot(mx, my), np.arctan2(my, mx)
    grain = rng.normal(0, 1.6, x.shape)
    sky = np.full((*x.shape, 3), [7, 14, 27], dtype=float)
    sky += np.exp(-((v - .53) / .22) ** 2)[..., None] * [35, 45, 49]
    sky += (noise(u * 8, v * 7) * 3 + grain)[..., None]

    bend = .14 + .19 * np.sin(u * 5.4 + .7) - .09 * np.sin(u * 10.2)
    strands = noise(u * 200, v * 3 + u * 4) * .24 + noise(u * 61, v * 2) * .31
    for offset, strength, color in [(0, 1, [17, 110, 85]), (-.072, .47, [7, 56, 82])]:
        edge = bend + offset + .024 * np.sin(u * 24 + v * 8)
        above = edge - v
        curtain = np.exp(-abs(above) / np.where(above > 0, .085, .009))
        curtain *= (.62 + strands) * (.34 + .66 * np.cos(u * 4 - .4) ** 2)
        sky += (curtain * strength)[..., None] * color
        threads = np.exp(-abs(above - .013 * np.sin(u * 19)) / .004)
        sky += (threads * strength * (.48 + strands))[..., None] * [5, 28, 21]

    for _ in range(width // 2):
        sx, sy = rng.integers(width), rng.integers(horizon)
        if distance[sy, sx] > 1.05:
            bright = rng.uniform(15, 150) * (1 - sy / horizon)
            sky[sy, sx] += [bright, bright, bright * .91]
            if bright > 108 and sx > 0:
                sky[sy, sx-1] += bright / 4

    ray = .75 + .15 * np.sin(angle * 19) + .1 * np.sin(angle * 43 + 1)
    outside = np.maximum(distance - 1, 0)
    halo = np.exp(-outside / .30) * ray
    sky += halo[..., None] * [88, 36, 11]
    sky += np.exp(-outside / .030)[..., None] * [110, 65, 28]
    maria = (noise(mx * 2 - 3, my * 2 + 12) * .55
             + noise(mx * 7, my * 7) * .28 + noise(mx * 22, my * 22) * .17)
    surface = 1 - np.minimum(1, distance) ** 2
    dark = np.array([29, 30, 38]) + (surface * 9 + maria * 19 + grain)[..., None]
    crescent = np.clip((np.hypot(mx + .087, my + .015) - .98) * 28, 0, 1)
    moon = dark + crescent[..., None] * [216, 148, 65]
    sky = np.where((distance < 1)[..., None], moon, sky)
    bead = np.hypot(mx - .986, my - .157)
    sky += np.exp(-bead / .047)[..., None] * [255, 202, 128]

    lens = width * (.93 if portrait else .60)
    slope = (np.arange(width) - width * .5) / lens
    skyline = np.full(width, horizon)
    for z in np.geomspace(1.2, 21, 1700):
        tx = slope * z
        hill = terrain(tx, z)
        projection = np.clip(horizon - (hill - .08) / z * lens * (1.63 if portrait else 1), 0, horizon).astype(int)
        visible = projection < skyline
        if not np.any(visible):
            continue
        idx = np.flatnonzero(visible)
        px, h = tx[idx], hill[idx]
        dx = (terrain(px + .016, z) - h) / .016
        dz = (terrain(px, z + .016) - h) / .016
        norm = np.sqrt(1 + dx * dx + dz * dz)
        light = np.clip((dx * .85 + dz * .32 + .35) / norm, 0, 1)
        strata = noise(px * 53 + z * 37, h * 74) * .13
        snow = np.clip((h - .85 + noise(px * 4, z * 4) * .38) * 1.7
                       + (1 / norm - .63) * 2.5 + strata, 0, 1)
        rock = np.array([12, 25, 32]) + light[:, None] * [64, 57, 42]
        ice = np.array([37, 60, 75]) + light[:, None] * [151, 124, 79]
        tint = rock + snow[:, None] * (ice - rock)
        haze = np.clip((z - 4) / 29, 0, .52)
        tint = tint * (1 - haze) + np.array([77, 90, 94]) * haze
        mist = .48 * np.exp(-np.maximum(0, h) * 2.7) * np.clip((z - 3) / 9, 0, 1)
        tint = tint * (1 - mist[:, None]) + np.array([112, 119, 114]) * mist[:, None]
        for row in range(int(np.max(skyline[idx] - projection[idx]))):
            keep = projection[idx] + row < skyline[idx]
            sky[projection[idx][keep] + row, idx[keep]] = tint[keep]
        skyline[idx] = projection[idx]

    depth = np.maximum(0, (y - horizon) / (height - horizon))
    wave = noise(x / (8 + depth * 80), y / (1.4 + depth * 4))
    swell = noise(x / (38 + depth * 130), y / (3 + depth * 8))
    reflect_y = np.clip(horizon - (y - horizon) * .97 + (wave + swell * .7) * (3 + depth * 78), 0, horizon-1).astype(int)
    reflect_x = np.clip(x + (wave + swell) * depth * width * .044, 0, width-1).astype(int)
    water = sky[reflect_y, reflect_x] * [.38, .54, .58] + [2, 6, 9]
    glitter = np.exp(-((x - moon_x - radius * .85) / (9 + depth * width * .13)) ** 2)
    glitter *= np.clip(wave + swell * .3 - .25, 0, 1) * np.exp(-depth * 3.8)
    water += glitter[..., None] * [224, 154, 71]
    sky[horizon:] = water[horizon:]
    sky += grain[..., None] * .65
    vignette = np.clip(1 - .23 * abs(u - .5) ** 1.5 * 2 - .25 * depth ** 2, .57, 1)
    img = Image.fromarray(np.uint8(np.clip(sky * vignette[..., None], 0, 255)))
    img.save(OUT / ("moonwater-portrait.webp" if portrait else "moonwater.webp"), quality=84, method=6)


if __name__ == "__main__":
    paint(1680, 1000, False)
    paint(780, 1280, True)
