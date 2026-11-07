# NCM Motorsports Park

Geometry: **draft**. Public timing: **missing**. Inspector: Codex, 2026-09-30.

Parent country snapshot: `world/us/osm.json`, SHA-256 `7e47953f68e565fb534ff05c0fad13deb32996c66103f61b844ef51979488410`. Venue subset SHA-256: `b6fbbbf8897672e3f252e8cb37645982a63aacdefab1cb6a0de7f2f0b5fa0f1b`.

## Previous connected course candidate (superseded)

Recipe: `layouts/main.json`. Approximate trace length: 5273.3 m. Candidate count: 115. Connected OSM course candidate. The selected loop is the longest simple source-node cycle after explicit exclusions; its association with a named circuit configuration requires review. Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read. Some source ways lack one-way direction tags. Travel direction is provisional.

Identity: [OSM way 326452593](https://www.openstreetmap.org/way/326452593). Source geometry: [way 326452609](https://www.openstreetmap.org/way/326452609), [way 326452604](https://www.openstreetmap.org/way/326452604), [way 326452608](https://www.openstreetmap.org/way/326452608), [way 326452603](https://www.openstreetmap.org/way/326452603), [way 333233170](https://www.openstreetmap.org/way/333233170), [way 326452610](https://www.openstreetmap.org/way/326452610).

Pit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.

Remaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.

## Grand Full source correction, 2026-11-07

The generic longest-cycle `main` hypothesis combined connector detours and the parallel pit lane. Native imagery separates that pit road from the racing straight; these source ways lack pit-lane tags, so tag filtering alone did not detect the selection error. The operator Grand Full map supports the racing straight, western chicane and northeastern extension already identified in the independently selected source. `main` now uses that exact node chain in `selected-network-326452603.json`, SHA-256 `3b0f817c2366d140bf1d83da10e219384fdf55ef6d61855c4899044ae6c4f1f1`. Coordinates and source direction are unchanged from that selected source, with no diagram tracing or distance fitting.

The old recipe, source pins and primary identity links remain in `sources/research/ncm-route-correction.json`. Its identical trace permits reuse of the existing original `ncm-grand-full` border features, with exact trace/feature hashes and `LicenseRef-Track-Borders` retained. Main timing stays missing; sibling timing GPS is not copied. All other layouts, prior border features and terrain are unchanged. Source direction and alignment remain draft; this correction does not establish surveyed border or curb accuracy.
