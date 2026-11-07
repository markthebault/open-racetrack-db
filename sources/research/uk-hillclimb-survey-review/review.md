The Environment Agency survey indexes provide another source for four of the five reviewed hillclimbs. The downloaded intensity rasters were inspected at native one-metre spacing. These are reflected laser intensity, not satellite photographs. Higher zoom levels of the licensed satellite imagery did not resolve the original blur.

| Route | Pinned survey | Finding |
| --- | --- | --- |
| Harewood | 30 December 2019 intensity; 2–6 April 2015 point cloud | Road visible throughout the raster. Complete measured/interpolated road-limit estimate now saved. Entrance limits follow adjoining visible road lines; two building-side intervals interpolate between neighbouring observations. Final widened bay retained. |
| Gurston Down | 25–29 April 2019 intensity | Field bends visible; hedge, farm entrance and side openings need further measurements. |
| Shelsley Walsh | 6 January–5 February 2020 intensity | Open sections visible; wooded bend and start apron remain uncertain. |
| Prescott | 13 February 2019 intensity | Open sections visible; canopy and neighbouring paths obscure some boundaries. |
| Fintray | No features in the three queried indexes | England-focused catalogues do not establish whether Scottish imagery exists. Another provider is needed. |

The subsequent Harewood boundary pass saves 82 anchors and an estimated open-run model in its existing GeoJSON. The other four routes remain held. Original trace, timing and terrain are retained. A visible road is not by itself a complete measured boundary recipe. The Harewood bend around station 300 was checked again at a larger scale and the trace follows the pavement; an initial impression that it cut the bend was rejected.

`review.json` keeps each bounded query, returned attributes, capture dates, archive/member hashes, native crop windows, masks and display stretches. Four original survey archives total about 169 MB; the optional Harewood point-cloud archive is about 231 MB. They remain outside Git. Track exports keep only the compact recipe and scalar terrain; road meshes and videos are generated on demand.

Reproduce the four native inspection crops and pinned Harewood border image with Python 3.12. The verified environment used numpy 2.5.4, rasterio 1.4.3, Pillow 11.3.0 and pyproj 3.7.0; matching Pillow preserves the pinned PNG encoding:

```sh
python reproduce-surveys.py --cache /path/to/survey-cache --border-images
```

Add `--point-cloud` with laspy 2.6.1 and lazrs 0.7.0 installed to validate the additional archive and actual LAZ header. This check does not claim to reconstruct its exploratory half-metre intensity visualization. That visualization averages measured returns in each grid cell and leaves cells without points transparent; it does not invent surface samples. The historic LAZ has no embedded CRS record, and its index identifies OSTN'02/OSGM'02. No modern-datum geometry or elevation is inferred from it.

The [National LIDAR Programme](https://www.data.gov.uk/dataset/f0db0249-f17b-4036-9e65-309148c97ce4/national-lidar-programme) and [time-stamped point-cloud catalogue](https://www.data.gov.uk/dataset/977a4ca4-1759-4f26-baa7-b566bd7ca7bf/lidar-time-stamped-point-cloud) provide the source and reuse evidence. Contains public sector information licensed under the Open Government Licence v3.0. Environment Agency.

`--border-images` verifies the official OSTN15 coordinate grid and uses nearest native samples to recreate the pinned EPSG:3857 PNG and metadata sidecar. Missing raster samples stay transparent. The embedded GeoJSON recipe can then be refreshed with that sidecar; no separate measurement file is required. One-metre output spacing is not a positional-accuracy claim.
