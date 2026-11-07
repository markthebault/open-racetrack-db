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


def point_cloud(record, cache, source):
    import laspy

    expected = source['renderReview']
    filename = source.get('cacheFile', 'harewood-pc-2015.zip')
    assert Path(filename).name == filename
    members = expected.get('members', [expected])
    with archive(source, cache / filename) as z:
        for member in members:
            raw = z.read(member['member'])
            assert sha(raw) == member['memberSha256']
            with laspy.open(io.BytesIO(raw), read_evlrs=False) as reader:
                header = reader.header
                assert header.point_count == member['pointCount']
                assert header.mins.tolist() == member['headerMins']
                assert header.maxs.tolist() == member['headerMaxs']
                assert str(header.parse_crs()) == member['crsHeader']
    print(f"{record['name']} {filename}: archive, {len(members)} members and actual point-cloud headers PASS")


def border_image(record, cache):
    from pyproj import Transformer, datadir
    from pyproj.transformer import TransformerGroup

    spec = record['borderImage']
    grid = spec['coordinateGrid']
    grid_path = cache / grid['file']
    if not grid_path.exists():
        with urllib.request.urlopen(grid['url'], timeout=45) as response:
            grid_path.write_bytes(response.read())
    assert sha(grid_path.read_bytes()) == grid['sha256']
    datadir.append_data_dir(str(cache.resolve()))
    group = TransformerGroup(4326, 27700, always_xy=True)
    assert group.best_available
    transform = group.transformers[0]
    assert transform.description == record['intensityRaster']['render']['transformOperation']
    image = spec['imagery']
    west, _, _, north = image['extent3857']
    spacing = spec['pixelSpacing3857']
    xx, yy = np.meshgrid(
        west + (np.arange(image['width']) + .5) * spacing,
        north - (np.arange(image['height']) + .5) * spacing,
    )
    lon, lat = Transformer.from_crs(3857, 4326, always_xy=True).transform(xx, yy)
    east, northing = transform.transform(lon, lat)
    native = record['intensityRaster']['render']
    a, _, left, _, e, top, *_ = native['transform']
    cols = np.floor((east - left) / a).astype(int)
    rows = np.floor((northing - top) / e).astype(int)
    source = np.array(Image.open(cache / f"{record['name']}-ea-intensity-native.png").convert('RGBA'))
    valid = (cols >= 0) & (cols < source.shape[1]) & (rows >= 0) & (rows < source.shape[0])
    output = np.zeros((image['height'], image['width'], 4), dtype='uint8')
    output[valid] = source[rows[valid], cols[valid]]
    output[np.all(output[:, :, :3] == [80, 20, 20], axis=2)] = [0, 0, 0, 0]
    path = cache / f"{record['name']}-ea-pinned.png"
    Image.fromarray(output).save(path)
    assert sha(path.read_bytes()) == image['sha256']
    path.with_suffix('.json').write_text(json.dumps(image, indent=2) + '\n')
    print(f"{record['name']}: pinned border image and coordinate-grid hashes PASS")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--point-cloud', action='store_true')
    parser.add_argument('--border-images', action='store_true', help='Recreate pinned EPSG:3857 border evidence; requires pyproj')
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
        if args.point_cloud:
            sources = record.get('supportingPointClouds', [])
            if 'additionalPointCloud' in record:
                sources = [record['additionalPointCloud'], *sources]
            for source in sources:
                point_cloud(record, args.cache, source)
        if args.border_images and 'borderImage' in record:
            border_image(record, args.cache)


if __name__ == '__main__':
    main()
