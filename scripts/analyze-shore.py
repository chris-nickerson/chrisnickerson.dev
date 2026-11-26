"""Analyze frozen-world captures. Requires Pillow and NumPy.
Usage: python scripts/analyze-shore.py --tag final near1 near8 final-near8
Names identify shore-NAME-0.png through -9.png in CAPTURE_DIR (default evidence/local). Camera translation is
identical; absolute deltas include legitimate edge motion, so only comparisons
between matched sweeps are meaningful. These are not perceptual quality scores.
"""
from PIL import Image, ImageDraw
import numpy as np
import json
import argparse
import os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--tag', default='comparison')
parser.add_argument('names', nargs='+')
args = parser.parse_args()
capture_dir = Path(os.environ.get('CAPTURE_DIR', 'evidence/local'))
boxes = {'island': (575,365,770,440), 'near-shore': (565,480,700,800),
         'far-shore': (890,340,1280,465), 'land': (100,450,500,650),
         'water': (750,500,1000,700)}
report = {'method': {'frames':10, 'cameraStepMetres':.08, 'regions':boxes}, 'variants':{}}
montage = Image.new('RGB', (250*len(args.names), 480))
draw = ImageDraw.Draw(montage)
for k, name in enumerate(args.names):
    frames = np.stack([np.asarray(Image.open(capture_dir / f'shore-{name}-{i}.png')).astype(float)[:,:,:3] for i in range(10)])
    diff = np.abs(np.diff(frames, axis=0))
    report['variants'][name] = {}
    for region, (x1,y1,x2,y2) in boxes.items():
        values = diff[:,y1:y2,x1:x2]
        report['variants'][name][region] = {
            'meanAbsDelta': float(values.mean()),
            'fractionAbove5': float((values.max(axis=3)>5).mean()),
            'fractionAbove15': float((values.max(axis=3)>15).mean())}
    heat = Image.fromarray(np.clip(diff.mean(axis=0)*18,0,255).astype('uint8'))
    heat.save(capture_dir / f'shore-{args.tag}-variation-{name}.png')
    montage.paste(heat.crop((520,350,770,800)), (k*250,20))
    draw.text((k*250+5,5), name)
montage.save(capture_dir / f'shore-{args.tag}-variation-comparison.png')
(capture_dir / f'shore-{args.tag}-variation.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
