The Environment Agency survey indexes provide another source for four of the five reviewed hillclimbs. The downloaded intensity rasters were inspected at native one-metre spacing. These are reflected laser intensity, not satellite photographs. Higher zoom levels of the licensed satellite imagery did not resolve the original blur.

| Route | Pinned survey | Finding |
| --- | --- | --- |
| Harewood | 30 December 2019 intensity; 2–6 April 2015 point cloud | Road visible throughout the raster. Entrances, building junction and final widened bay still need explicit observations. The denser historic cloud improves surface visibility. |
| Gurston Down | 25–29 April 2019 intensity | Field bends visible; hedge, farm entrance and side openings need further measurements. |
| Shelsley Walsh | 6 January–5 February 2020 intensity | Open sections visible; wooded bend and start apron remain uncertain. |
| Prescott | 13 February 2019 intensity | Open sections visible; canopy and neighbouring paths obscure some boundaries. |
| Fintray | No features in the three queried indexes | England-focused catalogues do not establish whether Scottish imagery exists. Another provider is needed. |

No road borders, models, elevations or coverage totals change in this review. A visible road is not a complete measured boundary recipe. The Harewood bend around station 300 was checked again at a larger scale and the trace follows the pavement; an initial impression that it cut the bend was rejected.

`review.json` keeps each bounded query, returned attributes, capture dates, archive/member hashes, native crop windows, masks and display stretches. Four original survey archives total about 169 MB; the optional Harewood point-cloud archive is about 231 MB. They remain outside Git. Crops and 3D meshes are not added to track exports.

Reproduce the four native inspection crops with Python 3.12, numpy, rasterio and Pillow:

```sh
python reproduce-surveys.py --cache /path/to/survey-cache
```

Add `--point-cloud` with laspy/lazrs installed to validate the additional archive and actual LAZ header. This check does not claim to reconstruct its exploratory half-metre intensity visualization. That visualization averages measured returns in each grid cell and leaves cells without points transparent; it does not invent surface samples. The historic LAZ has no embedded CRS record, and its index identifies OSTN'02/OSGM'02. No modern-datum geometry or elevation is inferred from it.

The [National LIDAR Programme](https://www.data.gov.uk/dataset/f0db0249-f17b-4036-9e65-309148c97ce4/national-lidar-programme) and [time-stamped point-cloud catalogue](https://www.data.gov.uk/dataset/977a4ca4-1759-4f26-baa7-b566bd7ca7bf/lidar-time-stamped-point-cloud) provide the source and reuse evidence. Contains public sector information licensed under the Open Government Licence v3.0. Environment Agency.
