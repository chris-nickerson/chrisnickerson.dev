"""Bake the fallback chart from the terrain grid. Run from the repository root."""
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

grid = subprocess.check_output(["node", "--import", "tsx", "--input-type=module", "-e", """
import { terrainHeight } from './src/terrain.ts';
const heights = new Float32Array(1280 * 800);
for (let y = 0; y < 800; y++)
  for (let x = 0; x < 1280; x++)
    heights[y * 1280 + x] = terrainHeight((x - 810) * 8, (y - 400) * 8);
process.stdout.write(Buffer.from(heights.buffer));
"""])
height = np.frombuffer(grid, dtype=np.float32).reshape(800, 1280)
dy, dx = np.gradient(height)
slope = np.hypot(dx, dy)


def contour(interval):
    distance = abs((height + interval / 2) % interval - interval / 2)
    return np.clip(1 - distance / np.maximum(.35, slope * .9), 0, 1)


relief = np.clip((dy + dx * .75) * 1.7, -18, 18)
land = np.clip(height / 1550, 0, 1) * 19 + relief + contour(45) * 9 + contour(225) * 20
sea = np.clip((height + 38) / 38, 0, 1) * 8
coast = np.clip(1 - abs(height) / np.maximum(.15, slope * 1.1), 0, 1) * 65
y, x = np.indices(height.shape)
grid_lines = ((x % 100 == 10) | (y % 100 == 0)) * 3
channels = [
    np.where(height > 0, land_base + land, sea_base + sea) + edge * coast + grid_lines
    for land_base, sea_base, edge in [(45, 17, 1), (66, 48, 1), (61, 53, .8)]
]
pixels = np.clip(np.stack(channels, axis=2), 0, 255).astype(np.uint8)
Image.fromarray(pixels).save(Path("public/images/inlet-chart.webp"), quality=72, method=6)
