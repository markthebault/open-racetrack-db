# Autobahn Country Club

Geometry: **draft**. Public timing: **missing**. Inspector: Codex, 2026-09-30.

Parent country snapshot: `world/us/osm.json`, SHA-256 `7e47953f68e565fb534ff05c0fad13deb32996c66103f61b844ef51979488410`. Venue subset SHA-256: `dced0a8a6ce16db158a3bf1af5da989fb577d94d8495ce175b6e6e8291f0883c`.

## Previous connected course candidate (superseded)

Recipe: `layouts/main.json`. Approximate trace length: 6014.9 m. Candidate count: 27. Connected OSM course candidate. The selected loop is the longest simple source-node cycle after explicit exclusions; its association with a named circuit configuration requires review. Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read. Some source ways lack one-way direction tags. Travel direction is provisional.

Identity: [OSM way 135130550](https://www.openstreetmap.org/way/135130550). Source geometry: [way 42852101](https://www.openstreetmap.org/way/42852101), [way 42853481](https://www.openstreetmap.org/way/42853481), [way 42852104](https://www.openstreetmap.org/way/42852104), [way 42852103](https://www.openstreetmap.org/way/42852103).

Pit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.

Remaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.

## Full-course source correction, 2026-11-07

The generic `main` longest-cycle hypothesis used the southeast North-course pit lane and an internal western connector. The operator Track Orientation PDF, page 7, identifies the direct full-course racing road and long western connection; native licensed imagery confirms both differences. No operator diagram coordinates or stated widths are extracted or fitted.

`main` now follows the exact registered full-course chain in `selected-network-42852101.json`, SHA-256 `611ee846c7ebd0ddf0db984353d12a7e1df6fa9f15764ac1c87903c7e721ba27`. Coordinates and direction follow that named source; provisional direction is not presented as confirmed. The previous recipe and trace hash, operator identity evidence and imagery hashes remain in `sources/research/autobahn-route-correction.json`.

The full-course sibling’s estimated borders reproduce exactly from the pinned public-domain NAIP image. Four complete native border-overlay regions were visually reviewed. Close-up checks exposed false automatic outer limits at corners; the exact RGB replay is rejected for main. The new main instead reconstructs paired limits from 650 image observations, selected after all eleven native proposal sheets and selected detail sheets were inspected. Four final native overlays were reviewed. The complete sparse recipe retains image coverage, width and route-order guards and public-domain rights. The automatic sibling remains unchanged. No original-border reuse or surveyed boundary claim is made. Main timing stays missing and sibling timing GPS is not copied. Other layouts, previous borders, timing and terrain remain unchanged. Shared-pavement joins interpolate estimates, curbs remain illustrative, raster elevation is approximate and unknown banking is represented as zero.
