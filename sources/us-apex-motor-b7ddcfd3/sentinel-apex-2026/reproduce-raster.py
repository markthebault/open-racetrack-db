"""Verify pinned native bands and reproduce the course inspection PNG.

Requires numpy, Pillow and rasterio. No supplied archive data is read.
"""
import argparse
import os
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject
from rasterio.windows import Window

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--online", action="store_true", help="Compare native samples against the public assets")
args = parser.parse_args()
os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".tif"
os.environ["GDAL_HTTP_TIMEOUT"] = "40"
ROOT = Path(__file__).resolve().parent
for date in ('20260918', '20260605'):
    manifest = json.loads((ROOT / f'{date}-manifest.json').read_text())
    for band in manifest['nativeBands'].values():
        path = ROOT / band['nativeFile']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == band['sha256']
        with rasterio.open(path) as native:
            assert native.crs.to_string() == band['crs']
            assert list(native.transform) == band['transform']
            assert (native.width, native.height) == (band['width'], band['height'])
            if args.online:
                with rasterio.open(band['url']) as remote:
                    assert remote.crs == native.crs
                    col, row = (~remote.transform) * (native.transform.c, native.transform.f)
                    assert abs(col - round(col)) < 1e-7 and abs(row - round(row)) < 1e-7
                    window = Window(round(col), round(row), native.width, native.height)
                    assert np.array_equal(native.read(1), remote.read(1, window=window))
                print(date, path.name, 'public source samples unchanged')
    print(date, 'native band hashes and georeferencing verified')

manifest = json.loads((ROOT / '20260918-manifest.json').read_text())
extent = manifest['inspectionExtent']
transform = from_bounds(extent['xmin'], extent['ymin'], extent['xmax'], extent['ymax'], 1000, 1000)
colors = []
for name in ('red', 'green', 'blue'):
    band = manifest['nativeBands'][name]
    with rasterio.open(ROOT / band['nativeFile']) as native:
        projected = np.zeros((1000, 1000), dtype=np.uint16)
        reproject(
            source=native.read(1), destination=projected,
            src_transform=native.transform, src_crs=native.crs,
            dst_transform=transform, dst_crs='EPSG:3857',
            resampling=Resampling.nearest,
        )
    values = projected.astype(float)
    low, high = np.percentile(values[450:640, 240:545], [2, 98])
    colors.append(np.clip((values - low) / (high - low) * 255, 0, 255).astype(np.uint8))
result = np.stack(colors, axis=-1)
image = ROOT.parent / 'sentinel-september-2026.png'
assert np.array_equal(result, np.asarray(Image.open(image)))
for name in ('imagery-course-apex-ii.json', 'imagery-course-apex-iii.json'):
    course = json.loads((ROOT.parent / name).read_text())
    assert hashlib.sha256(image.read_bytes()).hexdigest() == course['imagerySha256']
    assert course['extent'] == extent
print('September RGB raster pixels and course image hash verified')
