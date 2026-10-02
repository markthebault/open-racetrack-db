"""Reproduce the pinned public aerial render. Requires rasterio, numpy and Pillow."""
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import Affine, from_bounds
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds as window_bounds, transform as window_transform

root = Path(__file__).resolve().parent
metadata = json.loads((root / 'lgia-bikernieki-cycle-six-import.json').read_text())
source = metadata['sourceRaster']
render = metadata['render']
box = metadata['requestedGeographicBounds']
e = render['extent']
width, height = render['width'], render['height']
target_transform = from_bounds(e['xmin'], e['ymin'], e['xmax'], e['ymax'], width, height)
tf = source['transform']
native_transform = Affine(tf[0], tf[2], tf[4] - tf[0] / 2, tf[1], tf[3], tf[5] - tf[3] / 2)
native_bounds = transform_bounds(4326, 3059, *box, densify_pts=41)
window = window_bounds(*native_bounds, transform=native_transform).round_offsets().round_lengths()
output = np.zeros((3, height, width), dtype='uint8')
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY=2):
    with rasterio.open(source['rasterUrl']) as dataset:
        native = dataset.read([1, 2, 3], window=window)
        reproject(native, output, src_transform=window_transform(window, native_transform), src_crs=3059,
                  dst_transform=target_transform, dst_crs=3857, resampling=Resampling.bilinear)
path = root / 'lgia-bikernieki-cycle-six.png'
Image.fromarray(output.transpose(1, 2, 0)).save(path)
print('Raster SHA-256:', hashlib.sha256(path.read_bytes()).hexdigest())
