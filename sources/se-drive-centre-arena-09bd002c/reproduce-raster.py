"""Verify pinned Min karta pixels and reproject them. --online checks native WMS tiles."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling

root = Path(__file__).resolve().parent
m = json.loads((root / 'min-karta-import-drive-centre.json').read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--online', action='store_true')
args = parser.parse_args()

def checked_image(name, expected_hash, width, height):
    raw = (root / name).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == expected_hash, f'Hash mismatch: {name}'
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    assert im.size == (width, height), f'Dimension mismatch: {name}'
    return im

native = checked_image(m['nativeFile'], m['nativeSha256'], m['nativeWidth'], m['nativeHeight'])
course = checked_image(m['file'], m['imagerySha256'], m['width'], m['height'])
bb = m['nativeExtent']
assert m['nativeProjection'] == 'EPSG:3006' and m['requestedResolutionM'] == 0.5
assert (bb[2] - bb[0]) / native.width == (bb[3] - bb[1]) / native.height == 0.5
tr = from_bounds(*bb, native.width, native.height)
assert list(tr) == m['nativeTransform']
e = m['extent']
assert e['spatialReference'] == 3857 and m['resampling'] == 'nearest'
dt = from_bounds(e['xmin'], e['ymin'], e['xmax'], e['ymax'], course.width, course.height)
src = np.moveaxis(np.asarray(native), -1, 0)
dst = np.zeros((3, course.height, course.width), dtype=np.uint8)
for band in range(3):
    reproject(source=src[band], destination=dst[band], src_transform=tr,
              src_crs='EPSG:3006', dst_transform=dt, dst_crs='EPSG:3857',
              resampling=Resampling.nearest)
assert np.array_equal(np.moveaxis(dst, 0, -1), np.asarray(course)), 'Rendered pixels differ'
print('Pinned hashes, native georeferencing and every rendered pixel: PASS', flush=True)
# Check that every digitization vertex lies inside acquired source pixels.
for x, y in m['nativeCoursePixels']:
    assert 0 <= x < native.width and 0 <= y < native.height
    assert any(native.getpixel((round(x), round(y)))), 'Vertex lies outside acquired tiles'
if args.online:
    subprocess.run(['node', str(root / 'verify-public-tiles.mjs')], check=True, cwd=root.parent.parent)
