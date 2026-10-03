"""Verify bounded public GPS searches without extracting course coordinates.

Uses only the Python standard library. Offline verification requires the cached
GPX responses; --online requests the exact public pages again. Source changes
fail verification and require a new review rather than silently replacing it.
"""
import argparse
import hashlib
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


def local_name(element):
    return element.tag.rsplit('}', 1)[-1]


def summarize(raw):
    document = ET.fromstring(raw)
    if local_name(document) != 'gpx':
        raise ValueError('Public response is not GPX')
    tracks = [t for t in document if local_name(t) == 'trk']
    points = [p for t in tracks for p in t.iter() if local_name(p) == 'trkpt']
    timed = sum(any(local_name(child) == 'time' and child.text
                    for child in p) for p in points)
    return {
        'sha256': hashlib.sha256(raw).hexdigest(),
        'bytes': len(raw),
        'trackGroups': len(tracks),
        'points': len(points),
        'timedPoints': timed,
        'untimedPoints': len(points) - timed,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path)
    parser.add_argument('--online', action='store_true')
    args = parser.parse_args()
    if not args.online and args.cache_dir is None:
        parser.error('Use --cache-dir for offline verification or --online')
    root = Path(__file__).resolve().parent
    review = json.loads((root / 'review-index.json').read_text())
    if review['endpoint'] != 'https://api.openstreetmap.org/api/0.6/trackpoints':
        raise ValueError('Unexpected public endpoint')
    for record in review['records']:
        west, south, east, north = record['bbox']
        if not all(math.isfinite(v) for v in record['bbox']) or not (
                -180 <= west < east <= 180 and -90 <= south < north <= 90
                and (east - west) * (north - south) <= 0.25):
            raise ValueError('Invalid bounded venue search')
        if record['geometryRecovered'] is not False:
            raise ValueError('An index cannot establish a course trace')
        for page_number, expected in enumerate(record['pages']):
            if expected['page'] != page_number:
                raise ValueError('Nonsequential search pages')
            cache_file = expected['cacheFile']
            if Path(cache_file).name != cache_file:
                raise ValueError('Invalid cache filename')
            if args.online:
                query = urlencode({'bbox': ','.join(map(str, record['bbox'])),
                                   'page': page_number})
                with urlopen(review['endpoint'] + '?' + query, timeout=30) as response:
                    raw = response.read()
            else:
                raw = (args.cache_dir / cache_file).read_bytes()
            actual = summarize(raw)
            if actual != {key: expected[key] for key in actual}:
                raise ValueError(f"{record['id']} page {page_number}: source changed")
        if record['emptyTerminalPageObserved'] != (record['pages'][-1]['points'] == 0):
            raise ValueError('Search exhaustion claim does not match last page')
        print(record['id'], 'response hashes, pagination and point counts: PASS', flush=True)
    print('No coordinate values read, course inferred, or GPS samples exported')


if __name__ == '__main__':
    main()
