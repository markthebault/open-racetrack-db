"""Verify pinned survey archives and reproduce the four native intensity crops.

Requires Python 3.12, numpy, rasterio and Pillow. Optional point-cloud validation
also requires laspy and lazrs. Large original surveys stay in the chosen cache.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

import numpy as np
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parent


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def archive(source, path):
    if not path.exists():
        partial = path.with_suffix('.part')
        size = 0
        with urllib.request.urlopen(source['url'], timeout=45) as response:
            with partial.open('wb') as output:
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > source['bytes']:
                        raise ValueError('Survey is larger than the pinned archive')
                    output.write(chunk)
        assert size == source['bytes']
        assert sha(partial.read_bytes()) == source['sha256']
        partial.replace(path)
    raw = path.read_bytes()
    assert len(raw) == source['bytes'] and sha(raw) == source['sha256']
    return zipfile.ZipFile(io.BytesIO(raw))


def intensity(record, cache):
    name = record['name']
    source = record['intensityRaster']
    render = source['render']
    with archive(source, cache / f'{name}-ea-intensity.zip') as z:
        raw = z.read(render['member'])
    assert sha(raw) == render['nativeSha256']
    with MemoryFile(raw) as memory, memory.open() as dataset:
        assert str(dataset.crs) == render['crs']
        assert list(dataset.res) == render['sourceResolution'] == [1.0, 1.0]
        window = Window(*render['pixelWindow'])
        values = dataset.read(1, window=window, masked=True)
        assert list(dataset.window_transform(window)) == render['transform']
        assert values.shape == (render['height'], render['width'])
    assert int(np.ma.getmaskarray(values).sum()) == render['maskedPixels']
    low, high = np.percentile(values.compressed(), [2, 98])
    assert [float(low), float(high)] == render['displayStretch']
    gray = (np.clip((values.filled(low) - low) / (high - low), 0, 1) * 255).astype('uint8')
    rgb = np.repeat(gray[..., None], 3, axis=2)
    # This red sentinel marks missing samples for inspection, never road evidence.
    rgb[np.ma.getmaskarray(values)] = [80, 20, 20]
    assert sha(rgb.tobytes()) == render['rgbPixelsSha256']
    Image.fromarray(rgb).save(cache / f'{name}-ea-intensity-native.png')
    print(f'{name}: archive, native TIFF, grid, mask, stretch and RGB crop PASS')


def point_cloud(record, cache):
    import laspy

    source = record['additionalPointCloud']
    expected = source['renderReview']
    with archive(source, cache / 'harewood-pc-2015.zip') as z:
        raw = z.read(expected['member'])
    assert sha(raw) == expected['memberSha256']
    with laspy.open(io.BytesIO(raw), read_evlrs=False) as reader:
        header = reader.header
        assert header.point_count == expected['pointCount']
        assert header.mins.tolist() == expected['headerMins']
        assert header.maxs.tolist() == expected['headerMaxs']
        assert str(header.parse_crs()) == expected['crsHeader']
    print('harewood 2015: archive, member and actual point-cloud header PASS')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--point-cloud', action='store_true')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / 'review.json').read_text())
    for record in manifest['records']:
        for query in record['indexQueries'].values():
            assert query['featureCount'] == len(query['attributes'])
            canonical = json.dumps(query['attributes'], sort_keys=True, separators=(',', ':')).encode()
            assert sha(canonical) == query['attributesSha256']
        if 'intensityRaster' in record:
            intensity(record, args.cache)
        if args.point_cloud and 'additionalPointCloud' in record:
            point_cloud(record, args.cache)


if __name__ == '__main__':
    main()
