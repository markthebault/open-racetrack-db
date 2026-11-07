#!/usr/bin/env python3
"""Verify/download bounded dated NAIP renders; never write production track data."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from urllib.request import urlopen
from PIL import Image


def fetch(url):
    with urlopen(url, timeout=45) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--only', help='One recorded venue id')
    parser.add_argument('--online-items', action='store_true', help='Recheck original item date, resolution, asset and grid')
    args = parser.parse_args()
    manifest = json.loads(Path(__file__).with_name('naip-history-review.json').read_text())
    args.cache.mkdir(parents=True, exist_ok=True)
    records = [r for r in manifest['records'] if not args.only or r['id'] == args.only]
    if not records:
        raise ValueError('No matching recorded venue')
    for record in records:
        if args.online_items:
            for item in record['items']:
                assert item['url'] == 'https://planetarycomputer.microsoft.com/api/stac/v1/collections/naip/items/' + item['id']
                current = json.loads(fetch(item['url']))
                p = current['properties']
                assert current['id'] == item['id']
                assert [p['datetime'], p.get('gsd'), p.get('proj:epsg'), p.get('proj:transform')] == [item['datetime'], item['gsd'], item['epsg'], item['transform']]
                assert current['assets']['image']['href'] == item['assetHref']
            print(record['id'] + ': source item dates, grids, resolution and unsigned assets PASS')
        for render in record['renders']:
            info = render['imagery']
            url = urlsplit(info['url'])
            assert url.scheme == 'https' and url.netloc == 'planetarycomputer.microsoft.com'
            assert url.path.startswith('/api/data/v1/item/bbox/')
            suffix = url.path.removeprefix('/api/data/v1/item/bbox/')
            bounds, size = suffix.split('/')
            assert [float(x) for x in bounds.split(',')] == info['extent3857']
            assert size == str(info['width']) + 'x' + str(info['height']) + '.png'
            q = parse_qs(url.query)
            assert q['collection'] == ['naip'] and q['assets'] == ['image']
            assert q['bidx'] == ['1', '2', '3']
            assert q['dst_crs'] == q['coord_crs'] == ['EPSG:3857']
            assert q['resampling'] == q['reproject'] == ['nearest']
            assert q['return_mask'] == ['true']
            assert q['item'][0] in [item['id'] for item in record['items']]
            name = render['cacheFile']
            assert Path(name).name == name and name.endswith('.png')
            path = args.cache / name
            raw = path.read_bytes() if path.exists() else fetch(info['url'])
            assert hashlib.sha256(raw).hexdigest() == info['sha256']
            image = Image.open(io.BytesIO(raw))
            assert image.format == 'PNG' and image.mode == 'RGBA'
            assert image.size == (info['width'], info['height'])
            if not path.exists():
                path.write_bytes(raw)
            path.with_suffix('.json').write_text(json.dumps(info, indent=2) + '\n')
            print(record['id'] + ': ' + render['purpose'] + ' request, raster hash, RGB bands, mask and dimensions PASS')


if __name__ == '__main__':
    main()
