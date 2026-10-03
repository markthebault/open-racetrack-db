"""Re-fetch the exact public municipal exports, without reprojection or resizing."""

import hashlib
import json
import struct
import sys
from pathlib import Path
from urllib.request import urlopen

review = json.loads(Path(__file__).with_name('acquisition-review.json').read_text())
destination = Path(sys.argv[1]) if len(sys.argv) == 2 else None
if destination is None:
    raise SystemExit('Usage: download-public-images.py output-directory')
destination.mkdir(parents=True, exist_ok=True)

for raster in review['rasters']:
    with urlopen(raster['sourceUrl'], timeout=45) as response:
        data = response.read()
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise SystemExit(f"Public service did not return a PNG: {raster['file']}")
    dimensions = struct.unpack('>II', data[16:24])
    if dimensions != (raster['width'], raster['height']):
        raise SystemExit(f"Raster dimensions changed: {raster['file']}")
    if hashlib.sha256(data).hexdigest() != raster['sha256']:
        raise SystemExit(f"Public raster changed; review before replacement: {raster['file']}")
    (destination / raster['file']).write_bytes(data)
    print(f"Verified {raster['file']}: {dimensions[0]} x {dimensions[1]}")
