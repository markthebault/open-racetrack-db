# Huangtupo historical band review

The source package preserves native red, green, blue and near-infrared bands from the public Copernicus acquisitions of **27 February 2017**, **24 July 2017**, **5 October 2018** and **4 June 2019**. All four original windows contain 418 by 416 samples at 10 m resolution in EPSG:32650. The manifest pins the asset URLs, capture dates, native transforms and file hashes. Attribution: Contains modified Copernicus Sentinel data 2017, 2018 and 2019. The [Copernicus terms](https://dataspace.copernicus.eu/terms-and-conditions) establish the reuse basis for Sentinel data.

The inspection rasters use nearest-neighbor reprojection into the pinned Web Mercator extent and a recorded 2–98 percentile contrast stretch. Enlarged inspection pixels do not add source detail. Winter and summer 2017 captures also corroborate the western loop. Near-infrared observations reveal the western loop more clearly than the earlier colour-only image. They do not establish a complete route across the larger paved area or resolve every narrow connection. The entry remains a trace gap. No course pixels, private geometry, fitted length or inferred joining line are registered.

The catalogue name is retained; an independently verified operator identity for this compact historical course remains unresolved. A search result for the much newer Wuhan International Circuit cannot identify this older configuration.

From the repository root, verify the pinned native bands and inspection rasters offline:

```sh
python3 sources/research/reproduce-sentinel-review.py --review-dir sources/research/huangtupo-historical-bands
```

Add `--online` to compare all sixteen native band windows against the public assets. Verification checks every inspection pixel and the exact native grid; it does not establish the course layout.
