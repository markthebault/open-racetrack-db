"""Verify public point-cloud file hashes and actual header coverage; no points are read."""
import argparse
import hashlib
import io
import json
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlopen
import laspy

root = Path(__file__).resolve().parent
m = json.loads((root / 'acquisition.json').read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-zip', type=Path, help='Previously downloaded public survey ZIP')
args = parser.parse_args()
with tempfile.TemporaryDirectory() as tmp:
    source = args.source_zip or Path(tmp) / 'public-survey.zip'
    if args.source_zip is None:
        with urlopen(m['sourceUrl'], timeout=60) as response, source.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    assert source.stat().st_size == m['sourceZipBytes']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == m['sourceZipSha256']
    bb = m['reviewWindow']['bbox']
    intersections = []
    with zipfile.ZipFile(source) as z:
        assert sorted(z.namelist()) == sorted(r['member'] for r in m['members'])
        for r in m['members']:
            raw = z.read(r['member'])
            assert hashlib.sha256(raw).hexdigest() == r['sha256']
            with laspy.open(io.BytesIO(raw), read_evlrs=False) as reader:
                h = reader.header
                assert h.point_count == r['pointCount']
                assert h.mins.tolist() == r['minimums'] and h.maxs.tolist() == r['maximums']
                assert list(h.point_format.dimension_names) == r['dimensions']
                if max(h.mins[0], bb[0]) < min(h.maxs[0], bb[2]) and max(h.mins[1], bb[1]) < min(h.maxs[1], bb[3]):
                    intersections.append(r['member'])
    assert intersections == m['membersIntersectingReviewWindow'] == []
    print('Public ZIP and 12 member hashes, exact LAS headers, and absent connector coverage: PASS')
