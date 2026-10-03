#!/usr/bin/env python3
"""Verify pinned survey queries and optionally repeat them without credentials."""

import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
SERVICES = {
    "naip-index.json": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer",
    "naip-plus-index.json": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer",
    "lidar-index.json": "https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/24",
}


def verify_point(snapshot):
    origin = snapshot["publicSearchPointOrigin"]
    extent = origin["extent"]
    x, y = origin["pixel"]
    mx = extent["xmin"] + (x + 0.5) / origin["width"] * (extent["xmax"] - extent["xmin"])
    my = extent["ymax"] - (y + 0.5) / origin["height"] * (extent["ymax"] - extent["ymin"])
    expected = [mx / 6378137 * 180 / math.pi, math.atan(math.sinh(my / 6378137)) * 180 / math.pi]
    actual = list(map(float, snapshot["query"]["geometry"].split(",")))
    if len(actual) != 2 or any(abs(a - b) > 1e-12 for a, b in zip(actual, expected)):
        raise ValueError("Search point disagrees with the independent raster pixel")
    query = snapshot["query"]
    if query["inSR"] != 4326 or query["geometryType"] != "esriGeometryPoint" or query["returnGeometry"] != "false":
        raise ValueError("Survey query must request metadata at the declared public point")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--online", action="store_true", help="Repeat the three anonymous public queries; report source changes")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "manifest.json").read_text())
    if {entry["file"] for entry in manifest["snapshots"]} != set(SERVICES):
        raise ValueError("Unexpected survey snapshot inventory")
    for entry in manifest["snapshots"]:
        name = entry["file"]
        raw = (ROOT / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ValueError(f"Pinned snapshot changed: {name}")
        snapshot = json.loads(raw)
        if snapshot["service"] != SERVICES[name]:
            raise ValueError(f"Unexpected public service: {name}")
        verify_point(snapshot)
        if "error" in snapshot["response"] or snapshot["response"].get("exceededTransferLimit"):
            raise ValueError(f"Incomplete pinned service response: {name}")
        if args.online:
            request = Request(snapshot["service"] + "/query?" + urlencode(snapshot["query"]), headers={"User-Agent": "OpenRacetrackDB/0.1 (bounded public survey review)"})
            with urlopen(request, timeout=20) as response:
                current = json.load(response)
            if current != snapshot["response"]:
                raise ValueError(f"Public index changed: {name}; inspect new capture dates before updating this review")
        print(f"{name}: hash, public search point and {'live response' if args.online else 'pinned response'} verified")


if __name__ == "__main__":
    main()
