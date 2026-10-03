# Apex Motor

Named configurations follow exact independent source-node routes. Published circuit plans identify branches only; no image coordinates are copied. Historical alignment and direction remain draft.

## Northern Track Two

`imagery-course-apex-ii.json` supplies a coarse 4,080.7 m closed draft from the native 10 m Copernicus acquisition of 18 September 2026. The [team schedule](https://mgrracing.com/season-schedule/) identifies Track Two and links a [complete February 2026 onboard lap](https://www.youtube.com/watch?v=i-9BpzGI2yA). Its map and the [operator identification](https://apexmotorclub.com/track/) identify the branch sequence only. Their images and video are not georeferenced or digitized, and are not redistributed here. All trace vertices come from the public satellite raster.

The independent 5 June and 18 September acquisitions distinguish the paved western U and return diagonal from the lower drainage line and southern-course branches. The earlier rejected candidate incorrectly followed that lower line and remains excluded. The trace follows the northeastern straight and hairpin, small upper chicane, outer northern curve, inner western U and western paved return. The supplied start/finish passes the ordinary 30 m proximity check separately. Public timing remains absent.

The independently measured length differs from the supplied scalar by 157.7 m. A documented 200 m allowance preserves this difference. The operator advertises approximately 2.5 miles and the contractor reports 2.43 miles; neither number is used to scale or move vertices. Native 10 m resolution does not resolve racing-line placement or precise curb radii. Direction and historical equivalence remain draft. This trace supplies course context, not a certified timed lap.

`sentinel-apex-2026/` preserves both acquisitions' red, green, blue and near-infrared native windows, source asset URLs, SHA-256 hashes, native transforms and exact inspection extent. The RGB image uses nearest-neighbor reprojection and a per-band 2nd–98th percentile contrast stretch. It adds no spatial detail. Verify native files and reproduce every inspection pixel with `python3 sources/us-apex-motor-b7ddcfd3/sentinel-apex-2026/reproduce-raster.py`, using numpy, Pillow and rasterio.

Apex III remains unresolved. The new northern trace establishes one component, but both combined-course joins still require independent branch evidence. The operator's currently published combined graphic duplicates its southern image and is excluded as joining-route evidence.
