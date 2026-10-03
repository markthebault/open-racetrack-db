# Arlington public course evidence

The [City of Arlington Roads dataset](https://opendata.arlingtontx.gov/datasets/861ae9583db64b57b76f40125b56ce51_1/explore) declares CC BY 4.0 in its [item metadata](https://www.arcgis.com/sharing/rest/content/items/861ae9583db64b57b76f40125b56ce51?f=json). Attribution: City of Arlington, Roads, retrieved 3 October 2026. The saved source contains 136 centerline segments intersecting a small public stadium-district extent. Only street identity, status, ownership, edit date and geometry are retained. The exact query and snapshot fingerprint are recorded in `municipal-roads-review.json`.

The municipal lines cover the surrounding streets. They omit the stadium horseshoe and the new central racing connector. None of the returned segments has an edit date after the [2025 paving work](https://www.arlingtontx.gov/News-Articles/2025/September/Paving-the-Way-for-INDYCAR-Grand-Prix-of-Arlington). Edit dates describe the supplied records, not a guaranteed imagery capture or road construction date. The snapshot is useful source evidence, but it does not supply a complete race course.

The pinned Sentinel-2 acquisition was captured on **13 March 2026**, the first practice day. Its subset retains the source's **359 by 323 pixels at 10 m resolution** in EPSG:32614, without reprojection or interpolation. It shows the stadium district after construction but cannot resolve the small temporary turns. Attribution: Contains modified Copernicus Sentinel data 2026. The [Copernicus terms, section 3](https://dataspace.copernicus.eu/terms-and-conditions) distinguish freely reusable Sentinel data from other copyrighted portal content. No portal screenshots or commercial basemap imagery supply coordinates.

The [official Practice 1 results page](https://www.indycar.com/results/ntt-indycar-series/2026/java-house-grand-prix-of-arlington/practice-1) links the [Top Section Times report](http://www.imscdn.com/INDYCAR/Documents/5517/6788/indycar-topsectiontimes-p1.pdf). Its page 48 course map, version 1.1 revised 11 March 2026, labels both a main start/finish on the central straight and an alternate start/finish on the southern straight. It describes one 14-turn event course at 2.73 miles. This establishes that the event has more than one timing-line convention; it does not prove that every catalogue entry named Practice has the same geometry. The report is used only to identify the timing convention and branch order. No map pixels are traced, georeferenced or republished.

The requested catalogue records retain their supplied 4,494 m scalar distance. The published event distance is about 4,393.6 m, a discrepancy of about 100.4 m. A distance discrepancy alone does not establish a different physical layout. Both entries still require reusable evidence for the missing connectors and confirmation of the requested timing convention. No street loop, interpolated satellite line or official diagram is substituted for that evidence.

A further check pins native red, green, blue and near-infrared bands from **13 March and 22 September 2026** in `multiband-2026/`. Nearest-neighbor reprojection and a documented contrast stretch improve visibility of surface differences without adding spatial detail. The narrow stadium links and event turn sequence still cannot be established from these 10 m samples. The acquisition records preserve each public asset URL, native transform, dimensions, file hash and full inspection raster. No course pixel recipe is registered. The later image is a post-event observation, not evidence of race-day barrier placement.

The [TxGIO image-service listing](https://imagery.geographic.texas.gov/server/rest/services?f=pjson) has no newer freely downloadable Arlington orthoimage in its reviewed StratMap and NAIP services. The separate [Texas Imagery Service](https://geographic.texas.gov/texas-imagery-service.html) explicitly describes its images as restricted licensed material. [NCTCOG's cooperative imagery FAQ](https://nctcog.org/Regional-Data/Spatial-Data-Cooperative-Program-SDCP/Frequently-Asked-Questions) also describes purchased data and a contractor licence. Those services are not used to extract coordinates.

Reproduce the reviewed sources from the repository root:

```sh
node sources/research/arlington-public-course-evidence/download-municipal-roads.mjs --output /tmp/arlington-road-review
python3 sources/research/arlington-public-course-evidence/download-native-imagery.py --output /tmp/arlington-imagery-review
```

The first command uses the project's Playwright dependency and installed Chrome with an anonymous browser. The second requires rasterio, numpy and Pillow. Both refuse changed source content rather than silently replacing the reviewed files. The PNG downloader checks native pixel values, the exact grid, dimensions and encoded-file fingerprint. These are source coverage reviews; neither adds a mapped layout.

Verify the further native-band check, including comparison with the public source windows:

```sh
python3 sources/research/reproduce-sentinel-review.py --review-dir sources/research/arlington-public-course-evidence/multiband-2026 --online
```

Omit `--online` for offline verification of the pinned band hashes, georeferencing and every RGB/NIR inspection pixel.
