# Elvington 2024 point-cloud coverage

The [public 2024 point-cloud collection for SE6545](https://environment.data.gov.uk/tiles/collections/survey/lidar_point_cloud/2024/NaN/SE6545) provides a newer survey than the previously inspected 2020 intensity grid. Its native filenames identify capture on 17 November 2024. The 225,534,497-byte public ZIP contains 12 LAZ files. Their actual LAS header bounds, dimensions, point counts and exact file hashes are preserved in `acquisition.json`; the large source files remain in the local research cache.

None of these files intersects the pavement-end review window visible in the independently licensed 2020 intensity raster. The recorded EPSG:27700 rectangle covers that physical gap only, without importing course or timing coordinates. A download-grid label does not establish full coverage. The 2024 survey largely covers land southeast of the join and supplies no independent evidence for a connector there. No course trace is recovered from this package.

Attribution: Environment Agency; contains public sector information licensed under the Open Government Licence v3.0. The [time-stamped point-cloud dataset](https://www.data.gov.uk/dataset/977a4ca4-1759-4f26-baa7-b566bd7ca7bf/lidar-time-stamped-point-cloud) records the public source. Verification inspects native headers and opaque file hashes; it does not read point coordinates or any private archive.

Run `python3 sources/research/elvington-2024-point-cloud-coverage/reproduce-coverage.py` with laspy to download and verify the public ZIP. Supply `--source-zip /path/to/public-survey.zip` to verify a cached copy. The ZIP hash, all 12 member hashes, every recorded header and the absence of review-window coverage must match.
