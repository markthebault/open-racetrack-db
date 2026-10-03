"""Reproduce the reviewed Sentinel subset without increasing its resolution.

Requires rasterio, numpy and Pillow. Run from any working directory.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window, from_bounds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    review = json.loads((root / "event-date-imagery-review.json").read_text())
    os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
    os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".tif"
    os.environ["GDAL_HTTP_TIMEOUT"] = "30"
    with rasterio.open(review["sourceUrl"]) as source:
        if source.crs.to_string() != review["projection"]:
            raise ValueError("Source coordinate system changed")
        window = from_bounds(*review["bounds"], transform=source.transform)
        window = Window(round(window.col_off), round(window.row_off),
                        review["width"], review["height"])
        pixels = source.read([1, 2, 3], window=window)
        if list(source.window_transform(window)) != review["transform"]:
            raise ValueError("Source pixel grid changed")
    if pixels.shape != (3, review["height"], review["width"]):
        raise ValueError("Incomplete native-resolution subset")
    if hashlib.sha256(pixels.tobytes()).hexdigest() != review["pixelSha256"]:
        raise ValueError("Source pixels changed; a new review is required")
    args.output.mkdir(parents=True, exist_ok=True)
    destination = args.output / review["file"]
    Image.fromarray(np.moveaxis(pixels, 0, -1)).save(destination)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != review["sha256"]:
        raise ValueError("PNG encoding differs from the pinned export")
    print(f"Verified {review['width']} x {review['height']} native pixels: "
          f"{destination}")


if __name__ == "__main__":
    main()
