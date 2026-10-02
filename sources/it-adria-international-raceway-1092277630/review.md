# Adria International Raceway

Geometry: **draft**. Public timing: **missing**. Inspector: Codex, 2026-09-30.

Parent country snapshot: `europe/it/osm.json`, SHA-256 `bdcde3d9472a2628d682f3f37ee5ab4493d22892feb3b6064425831b20dff8eb`. Venue subset SHA-256: `33777bd0c0dd57a04543f7271b23cc20dc427500e460cb630447cd806e4b9a0a`.

## Connected course candidate

Recipe: `layouts/main.json`. Approximate trace length: 2655.4 m. Candidate count: 4. Closed named OSM raceway retained as a course candidate. Named-layout association requires review. Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read.

Identity: [OSM way 1092277630](https://www.openstreetmap.org/way/1092277630). Source geometry: [way 1092277633](https://www.openstreetmap.org/way/1092277633).

Pit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.

Remaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.

## Independently mapped 2021 full course

The national AGEA 2024 RGB orthophoto resolves the complete rebuilt course. Its public level-18 cache grid supplies all vertices in `full-course-imagery.json`. The route follows the two inner returns in their connected pavement order, then the complete western straight, southern switchbacks, southeastern loop and outer return to the main straight. The pit lane and outer-course shortcut are excluded. The independently authored 2021 full-course plan at https://www.racingcircuits.info/europe/italy/adria.html is inspected for branch identity only; its pixels are not digitized. The simulator developer identification at https://game.raceroom.com/store/tracks/all/adria-international-raceway-2021 and FIA 2021 race reports corroborate the extended-course identity.

The draft measures 3,728.4 m against the catalogue scalar of 3,752 m. This 23.6 m difference remains unresolved. The course is not scaled or fitted to the catalogue. Fine centerline placement and historical-year correspondence remain draft. Private start/finish data is checked separately and stays in the private overlay.

`agea-adria-2024-import.json` pins every public tile URL and hash, service identity, native resolution, cache grid and mosaic hash. `agea-license-review.txt` records the national publisher legal notes. The national publisher licenses RGB orthophotos under CC BY 4.0, and its public service item identifies this cache as the same dataset. Attribution: AGEA, CC BY 4.0. The cached pixels have approximately 42 cm ground spacing here; pixel size does not establish positional accuracy. No resampling adds resolution.

To reproduce the image, run `node sources/it-adria-international-raceway-1092277630/download-public-tiles.mjs /tmp/adria-public-tiles`, then `python3 sources/it-adria-international-raceway-1092277630/stitch-public-tiles.py /tmp/adria-public-tiles /tmp/agea-adria-2024.png`. The downloader uses ordinary anonymous requests in the publisher viewer session. The stitcher requires Pillow and rejects changed source tile bytes.
