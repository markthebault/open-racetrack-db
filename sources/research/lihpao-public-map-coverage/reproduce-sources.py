"""Re-fetch the reviewed open sources without interpreting private course data."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.request

from PIL import Image
import shapefile


ROOT = Path(__file__).resolve().parent


def fetch(url, expected):
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read(32 * 1024 * 1024 + 1)
    if len(raw) > 32 * 1024 * 1024:
        raise ValueError("Source exceeds the reviewed download limit")
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("Public source changed; review it before replacing evidence")
    return raw


def verify(path, expected):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f"Reproduced output differs: {path.name}")


def reproduce_map(output):
    review = json.loads((ROOT / "open-map-review.json").read_text())
    if review["layer"] != "EMAP6_OPENDATA" or review["zoom"] != 15:
        raise ValueError("Only the separately licensed native open-data layer is reviewed")
    mosaic = Image.new("RGB", (
        (review["xmaxTile"] - review["xminTile"] + 1) * 256,
        (review["ymaxTile"] - review["yminTile"] + 1) * 256,
    ))
    for tile in review["records"]:
        raw = fetch(tile["url"], tile["sha256"])
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        if image.size != (tile["width"], tile["height"]) or image.size != (256, 256):
            raise ValueError("Native tile dimensions changed")
        mosaic.paste(image, (
            (tile["x"] - review["xminTile"]) * 256,
            (tile["y"] - review["yminTile"]) * 256,
        ))
    target = output / "open-map-native.png"
    mosaic.save(target)
    verify(target, review["mosaicSha256"])


def reproduce_roads(output):
    review = json.loads((ROOT / "municipal-road-review.json").read_text())
    pinned = json.loads((ROOT / "municipal-native-road-lines.json").read_text())
    raw = fetch(review["sourceUrl"], review["sourceSha256"])
    with tempfile.TemporaryDirectory(prefix="lihpao-open-roads-") as work:
        folder = Path(work)
        archive = folder / "municipal-roads.7z"
        archive.write_bytes(raw)
        members = subprocess.check_output(["bsdtar", "-tf", str(archive)], text=True).splitlines()
        allowed = {review["memberBase"] + "." + suffix for suffix in (
            "shp", "shx", "dbf", "prj", "cpg", "sbn", "sbx", "xml",
        )}
        if len(members) != len(allowed) or set(members) != allowed:
            raise ValueError("Archive member names changed; inspect before extraction")
        subprocess.run(["bsdtar", "-xf", str(archive), "-C", work], check=True)
        reader = shapefile.Reader(str(folder / (review["memberBase"] + ".shp")), encoding="utf-8")
        records = []
        for item in reader.iterShapeRecords(bbox=review["bbox"]):
            properties = item.record.as_dict()
            records.append({
                "properties": {field: properties[field] for field in review["propertyFields"]},
                "geometry": item.shape.__geo_interface__,
            })
        if len(records) != review["featureCount"]:
            raise ValueError("Scoped road count changed")
        result = {"bbox": review["bbox"], "projectionWkt": pinned["projectionWkt"], "records": records}
        target = output / "municipal-native-road-lines.json"
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        verify(target, review["outputSha256"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    reproduce_map(args.output)
    reproduce_roads(args.output)
    print("Four native map tiles and 179 municipal road lines reproduced with exact hashes.")
