"""Render the inlet's two atlas plates. Run from the repo root with NumPy and Pillow."""

import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path("src/atlas")
STEP = 6
XMIN, XMAX = -4200, 4200
ZMIN, ZMAX = -4500, 3000
NX, NZ = (XMAX - XMIN) // STEP + 1, (ZMAX - ZMIN) // STEP + 1
WIDTH, HEIGHT = 1800, 1130
ANGLE, TILT = np.radians([29, 31])
C, S, UP, BACK = np.cos(ANGLE), np.sin(ANGLE), np.cos(TILT), np.sin(TILT)
SCALE = 0.146
CX, CY = 840, 650
BASE = -680


def node(source):
    return subprocess.check_output(
        ["node", "--import", "tsx", "--input-type=module", "-e", source]
    )


def projected(x, y, z):
    return [
        CX + SCALE * (C * x - S * z),
        CY + SCALE * (BACK * (S * x + C * z) - UP * y),
    ]


raw = node(f"""
import {{ terrainHeight }} from './src/terrain.ts';
const grid = new Float32Array({NX * NZ});
for (let z=0; z<{NZ}; ++z)
    for (let x=0; x<{NX}; ++x)
        grid[z*{NX}+x]=terrainHeight({XMIN}+x*{STEP},{ZMIN}+z*{STEP});
process.stdout.write(Buffer.from(grid.buffer));
""")
h = np.frombuffer(raw, dtype="=f4").reshape(NZ, NX)
z, x = np.ogrid[ZMIN : ZMAX + 1 : STEP, XMIN : XMAX + 1 : STEP]
slope_z, slope_x = np.gradient(h, STEP)
normal = np.sqrt(1 + slope_x**2 + slope_z**2)
rng = np.random.default_rng(42)
grain = rng.normal(0, 2.4, h.shape)
corners = np.array([[XMIN, ZMIN], [XMIN, ZMAX], [XMAX, ZMIN], [XMAX, ZMAX]])
distances = corners @ [S, C]
screen_x = (np.arange(WIDTH) + 0.5 - CX) / SCALE
land = h > 0


def surface(sun_x, sun_z):
    elevation = 0.74
    lighting = (elevation - sun_x * slope_x - sun_z * slope_z) / normal
    horizon = np.zeros_like(h)
    iz, ix = np.ogrid[:NZ, :NX]
    for distance in np.geomspace(16, 2800, 30):
        sx = np.clip(ix + round(distance * sun_x / STEP), 0, NX - 1)
        sz = np.clip(iz + round(distance * sun_z / STEP), 0, NZ - 1)
        horizon = np.maximum(horizon, (h[sz, sx] - np.maximum(h, 0)) / distance)
    shade = np.clip((horizon - elevation) * 1.8, 0, 1)
    snow_line = h + 170 * (1 - 1 / normal) - 90 * np.maximum(slope_z, 0)
    levels = [-40, -16, -2, 0, 1, 34, 150, 450, 850, 1050, 1350, 1580, 1880, 2600]
    palette = np.array(
        [
            [19, 82, 92],
            [27, 110, 116],
            [116, 177, 155],
            [157, 192, 158],
            [195, 181, 125],
            [129, 153, 111],
            [110, 136, 102],
            [151, 155, 116],
            [177, 161, 132],
            [179, 171, 149],
            [206, 198, 171],
            [227, 222, 201],
            [244, 240, 225],
            [250, 246, 234],
        ]
    )
    color = np.stack(
        [np.interp(np.where(land, snow_line, h), levels, ch) for ch in palette.T],
        axis=-1,
    )
    contrast = np.where(land, np.clip(0.55 + 0.65 * lighting, 0.28, 1.28), 1.0)
    color *= contrast[:, :, None]
    shadow = shade * np.where(land, 0.52, 0.33)
    color = (
        color * (1 - shadow[:, :, None]) + np.array([33, 61, 71]) * shadow[:, :, None]
    )
    gradient = np.hypot(slope_x, slope_z) * STEP
    ink = np.clip(
        1 - abs((h + 37.5) % 75 - 37.5) / np.maximum(1.0, gradient * 0.95), 0, 1
    )
    index = np.clip(
        1 - abs((h + 187.5) % 375 - 187.5) / np.maximum(1.0, gradient * 1.35), 0, 1
    )
    water_lines = np.sin(
        z * 0.16 + x * 0.028 + 2 * np.sin(x * 0.005) + np.sin(z * 0.008)
    )
    details = (
        np.where(
            land,
            -15 * ink - 10 * index,
            4 * water_lines + 3 * np.sin(x * 0.003 + np.sin(z * 0.002)),
        )
        + grain
    )
    return np.clip(color + details[:, :, None], 0, 255).astype(np.uint8)


def plate(stone, reverse):
    image = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    horizon = np.full(WIDTH, HEIGHT)
    for depth in np.arange(distances.max(), distances.min() - STEP, -STEP):
        wx = C * screen_x + S * depth
        wz = -S * screen_x + C * depth
        columns = np.flatnonzero(
            (wx >= XMIN) & (wx <= XMAX) & (wz >= ZMIN) & (wz <= ZMAX)
        )
        if not len(columns):
            continue
        xs, zs = wx[columns], wz[columns]
        ix, iz = (
            np.rint((xs - XMIN) / STEP).astype(int),
            np.rint((zs - ZMIN) / STEP).astype(int),
        )
        top = np.rint(
            CY + SCALE * (BACK * depth - UP * np.maximum(0, h[iz, ix]))
        ).astype(int)
        first = horizon[columns] == HEIGHT
        if first.any():
            cc = columns[first]
            yy = np.arange(
                max(0, top[first].min()),
                min(HEIGHT, math.ceil(CY + SCALE * (BACK * depth - UP * BASE))),
            )[:, None]
            altitude = (BACK * depth - (yy - CY) / SCALE) / UP
            offset = wx[cc] * 0.00135 + wz[cc] * 0.0018
            strata = (
                altitude
                + 53 * np.sin(offset)
                + 31 * np.sin(offset * 2.9 + altitude * 0.0009)
            )
            edge = np.abs(wx[cc] - XMAX) < STEP
            beds = (
                np.sin(strata * 0.0105)
                + 0.5 * np.sin(strata * 0.0251)
                + 0.24 * np.sin(strata * 0.132)
            )
            value = 18 * beds - 18 * (np.cos(strata * 0.091) > 0.91)
            value += (
                (edge * (22 if reverse else -24))
                - 12
                + np.clip(altitude * 0.02, -15, 16)
            )
            color = np.array([166, 145, 118]) + value[:, :, None]
            ground = h[iz[first], ix[first]]
            water = altitude > ground
            water_depth = np.clip(-altitude / 35, 0, 1)
            color = np.where(
                water[:, :, None],
                np.array([77, 150, 146]) - water_depth[:, :, None] * [42, 49, 48],
                color,
            )
            soil = (altitude < ground) & (altitude > ground - 32)
            color = np.where(
                soil[:, :, None],
                np.array([93, 92, 66]) + value[:, :, None] * 0.4,
                color,
            )
            valid = (altitude >= BASE) & (yy >= top[first])
            rr, jj = np.nonzero(valid)
            image[yy[rr, 0], cc[jj], :3] = np.clip(color[rr, jj], 0, 255)
            image[yy[rr, 0], cc[jj], 3] = 255
            horizon[cc] = top[first] + 1
        end = horizon[columns]
        for offset in range(max(0, int((end - top).max()))):
            rows = top + offset
            keep = (rows < end) & (rows >= 0) & (rows < HEIGHT)
            image[rows[keep], columns[keep], :3] = stone[iz[keep], ix[keep]]
            image[rows[keep], columns[keep], 3] = 255
        horizon[columns] = np.minimum(end, top)
    return Image.fromarray(image)


for name, direction in [("west", (-0.85, -0.527)), ("east", (0.83, -0.558))]:
    image = plate(surface(*direction), name == "east")
    image.save(OUT / f"relief-{name}.webp", quality=82, method=6)
    image.resize((900, 565), Image.Resampling.LANCZOS).save(
        OUT / f"relief-{name}-small.webp", quality=82, method=6
    )
places = json.loads(
    node("""
import { places } from './src/places.ts';
console.log(JSON.stringify(Object.fromEntries(Object.entries(places).map(([k,p])=>[k,[p.berth.x,p.berth.z]]))));
""")
)
positions = {
    k: [round(a / b * 100, 3) for a, b in zip(projected(x, 0, z), (WIDTH, HEIGHT))]
    for k, (x, z) in places.items()
}
(OUT / "positions.json").write_text(json.dumps(positions, indent=2) + "\n")
