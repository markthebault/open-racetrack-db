# Homestead-Miami Speedway

Geometry: **draft**. Public timing: **missing**. Inspector: Codex, 2026-09-30.

Parent country snapshot: `world/us/osm.json`, SHA-256 `7e47953f68e565fb534ff05c0fad13deb32996c66103f61b844ef51979488410`. Venue subset SHA-256: `45701ce3aea8fb13cc266834b904f765487cdd0db15c67a1713914e8e817a315`.

## Previous connected course candidate (superseded)

Recipe: `layouts/main.json`. Approximate trace length: 3761.8 m. Candidate count: 21. Connected OSM course candidate. The selected loop is the longest simple source-node cycle after explicit exclusions; its association with a named circuit configuration requires review. Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read. Some source ways lack one-way direction tags. Travel direction is provisional.

Identity: [OSM way 186957272](https://www.openstreetmap.org/way/186957272). Source geometry: [way 1328685645](https://www.openstreetmap.org/way/1328685645), [way 108378854](https://www.openstreetmap.org/way/108378854), [way 1146967010](https://www.openstreetmap.org/way/1146967010), [way 1328685644](https://www.openstreetmap.org/way/1328685644), [way 108378855](https://www.openstreetmap.org/way/108378855), [way 108159182](https://www.openstreetmap.org/way/108159182), [way 1146967012](https://www.openstreetmap.org/way/1146967012).

Pit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.

Remaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.

## Modified-course source correction, 2026-11-07

The generic `main` longest-cycle hypothesis left the oval on an outside spur, causing 151.73 and 164.09 degree reversals. Native licensed imagery shows that spur outside the race surface. Will Pittenger’s independently authored modified-course diagram (CC BY-SA 3.0, 2009) identifies the direct oval join, which matches the pinned modified-course chain and current physical paving. The operator lists the modified road course, but its map asset returned HTTP 403 and is not claimed as visually inspected. No diagram coordinates are extracted or fitted to a nominal length.

`main` now uses the exact chain in `course-network-108159182.json`, SHA-256 `da98d14d35eb18c136a3b744cf1afc3c83f8324d8f7ea7a7ddb255107a9f616f`. All common source nodes and source direction are retained. The old recipe, needle-node events and primary/independent identity evidence remain in `sources/research/homestead-route-correction.json`. The identical corrected trace allows exact original-border reuse from `homestead-modified-road-course`, retaining full-feature hashes and `LicenseRef-Track-Borders`. Main timing stays missing; sibling timing GPS is not copied. Other layouts, prior borders and terrain remain unchanged.

The reconstruction uses raster elevations and zero banking. Actual oval banking is not reconstructed, source alignment and original borders remain unverified, and curbs remain illustrative. This source correction does not establish vehicle-physics or banked-road accuracy.
