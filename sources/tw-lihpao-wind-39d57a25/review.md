# Lihpao Wind course review

The Wind layout now has a complete 2,024.4 m coarse draft from pinned native 10 m Copernicus Sentinel bands captured on 21 September 2026. The independent 3 June 2026 red, green, blue and near-infrared samples corroborate the western rounded return and closing connector. The short connector closes Wind without using the separate southwestern Thunder hairpin. The southeastern Fire sector and pit route are also excluded.

The [operator zone description](https://www.lihpaoracing.com.tw/tw/gokart/infomation) separates Wind, Thunder and Fire. Its zone graphic and [oblique aerial photo](https://www.lihpaoracing.com.tw/tw/gokart/image/racing-park_imfomation/line2-bottom.jpg) identify the paved branch arrangement. Neither image is georeferenced, digitized or redistributed. `identity-review.json` pins the aerial identity fingerprint. The partial public course way [1323087236](https://www.openstreetmap.org/way/1323087236) independently corroborates the western connector corridor but does not supply this recipe's coordinates.

All recipe coordinates are independently selected from the reusable satellite raster. Native samples are reprojected with nearest-neighbor resampling and a per-band 2nd–98th percentile contrast stretch, sampled over the recorded western review window. These operations add no spatial detail. Additional vertices on the long straights preserve the selected straight lines. The source image hash, exact EPSG:3857 extent, native affine transforms and all eight band hashes are preserved.

The draft differs from the supplied 2,071 m scalar by 46.6 m and from the operator's rounded 2 km description by 24.4 m. The 100 m source allowance preserves that discrepancy without fitting coordinates. Native 10 m resolution leaves fine corner radii and the narrow connector centerline provisional. Direction and historical correspondence also remain draft. Public timing GPS is absent. This is supporting course geometry, not a surveyed racing line or certified timed lap.

The [previous public map coverage review](../research/lihpao-public-map-coverage/review.md) still documents why the municipal centerlines and coarse national open map cannot supply this connector. Those sources did not recover the geometry.

Run `python3 sources/tw-lihpao-wind-39d57a25/sentinel-wind-2026/reproduce-raster.py` with numpy, Pillow and rasterio to verify native files and reproduce every course-image pixel. Add `--online` to compare all eight native windows with the public source assets. No private archive geometry is read by the reproduction script.
