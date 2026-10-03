# Apex public survey coverage

Reviewed 3 October 2026. The later multi-acquisition review recovers northern Track Two and combined Track Three as coarse drafts.

The public road snapshot currently supplies the southern circuit. It does not map the complete northern circuit. The operator identifies [Track Two and the combined Track Three](https://apexmotorclub.com/track/). Its rounded advertised lengths alone do not establish a different historical configuration from the supplied entries. The earlier gap explanation asserted that difference without enough evidence and has been corrected.

The search point here comes from pixel 350, 500 of the independently georeferenced September 2026 Sentinel inspection image. Each snapshot preserves the image source URL, inspection hash, exact Web Mercator extent and pixel-to-point calculation. The point is inside the northern course area, rather than the undeveloped land farther north. No supplied course coordinates enter the calculation.

| Public index | Coverage returned at that point | Capture period |
| --- | --- | --- |
| USGS NAIP Imagery | `m_3311263_ne_12_030_20230917` | 17 September 2023 |
| USGS NAIP Plus | The same NAIP acquisition | 17 September 2023 |
| USGS 3DEP point clouds | `AZ_MaricopaPinal_1_2020` | 2 October 2020 to 18 December 2021 |

The LiDAR publication date is 31 March 2022. These dates describe the coverage returned by the public indexes on the review date, not every possible local survey. The [paving contractor's project account](https://theasphaltpro.com/articles/echelon-paving-apex-motorsports-track/) dates construction to August 2024 through February 2025. Those indexed captures therefore predate the northern asphalt expansion.

The subsequent [northern-course review](../../us-apex-motor-b7ddcfd3/review.md) compares independently available June and September 2026 Sentinel bands. Contrast review and the team-linked February 2026 onboard establish the paved western return. Northern Track Two now has a coarse draft trace. Native resolution remains 10 m; contrast changes add no spatial detail. The separately published operator combined map subsequently identifies both joins, which are independently mapped from the same native public bands. The complete northern and combined drafts remain coarse supporting geometry. No candidate is adjusted to a nominal distance or closed across an unresolved gap.

The county's fine 2025 aerial service is a separate source. An empty copyright field or a technical `AllowCopy` setting does not establish its redistribution terms; those settings are not a reuse declaration. No county image coordinates are imported by this review.

These committed files contain public survey index metadata only. They contain no private course data, no private timing positions and no imagery-derived route. The [USGS NAIP service](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer) and [3DEP index](https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer) are the primary sources for the recorded survey identities and dates.

Verify the saved file hashes and independently calculated search point with Python's standard library:

```sh
python3 sources/research/apex-public-survey-coverage/reproduce-index.py
```

Repeat all three anonymous public metadata queries:

```sh
python3 sources/research/apex-public-survey-coverage/reproduce-index.py --online
```

The online check reports any source change for review. It does not overwrite the pinned responses or interpret publication dates as capture dates.
