"""Verify native public bands and reproduce a pinned research-only raster.

Requires numpy, Pillow and rasterio. This command never reads the private archive
and does not create course coordinates.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject
from rasterio.windows import Window

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--review-dir', type=Path, required=True)
parser.add_argument('--online', action='store_true')
args = parser.parse_args()
os.environ['GDAL_DISABLE_READDIR_ON_OPEN'] = 'EMPTY_DIR'
os.environ['CPL_VSIL_CURL_ALLOWED_EXTENSIONS'] = '.tif'
os.environ['GDAL_HTTP_TIMEOUT'] = '40'
root = args.review_dir.resolve()
review = json.loads((root / 'multiband-review.json').read_text())
assert review['geometryRecovered'] is False
extent = review['inspectionExtent']
size = review['inspectionSize']
transform = from_bounds(extent['xmin'], extent['ymin'], extent['xmax'], extent['ymax'], *size)
x0, y0, x1, y1 = review['stretchPixels']
for acquisition in review['acquisitions']:
    manifest = json.loads((root / acquisition['manifestFile']).read_text())
    channels = {}
    for name, band in manifest['bands'].items():
        path = root / band['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == band['sha256']
        with rasterio.open(path) as native:
            assert native.crs.to_string() == band['crs']
            assert list(native.transform) == band['transform']
            assert (native.width, native.height) == (band['width'], band['height'])
            values = native.read(1)
            if args.online:
                with rasterio.open(band['url']) as remote:
                    assert remote.crs == native.crs
                    col, row = (~remote.transform) * (native.transform.c, native.transform.f)
                    assert abs(col - round(col)) < 1e-7 and abs(row - round(row)) < 1e-7
                    window = Window(round(col), round(row), native.width, native.height)
                    assert np.array_equal(values, remote.read(1, window=window))
                print(path.name, 'public native samples unchanged', flush=True)
            projected = np.zeros((size[1], size[0]), dtype=np.uint16)
            reproject(values, projected, src_transform=native.transform, src_crs=native.crs,
                      dst_transform=transform, dst_crs='EPSG:3857', resampling=Resampling.nearest)
        low, high = np.percentile(projected[y0:y1, x0:x1], [2, 98])
        assert high > low
        channels[name] = np.clip((projected.astype(float) - low) / (high - low) * 255, 0, 255).astype(np.uint8)
    for raster in acquisition['rasters']:
        path = root / raster['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == raster['sha256']
        pixels = channels['nir'] if raster['kind'] == 'nir' else np.stack([channels[n] for n in ('red', 'green', 'blue')], axis=-1)
        if pixels.ndim == 2:
            pixels = np.repeat(pixels[:, :, None], 3, axis=2)
        assert np.array_equal(pixels, np.asarray(Image.open(path)))
        print(path.name, 'every raster pixel reproduced', flush=True)
print('Native georeferencing, file hashes and contrast-stretched research rasters verified')
