# Jyllandsringen

Geometry: **draft**. Public timing: **missing**. Inspector: Codex, 2026-09-30.

Parent country snapshot: `europe/dk/osm.json`, SHA-256 `5584dec2b8dc5531589ee43c2d21a033a32a67e14e76e1961313efda831ed5b0`. Venue subset SHA-256: `337473ccc2448a50b4d97e156e449ac2801d0fbf2dcdca9cd4a8c661deeef354`.

## Previous connected course candidate (superseded)

Recipe: `layouts/main.json`. Approximate trace length: 2878.4 m. Candidate count: 200. Connected OSM course candidate. The selected loop is the longest simple source-node cycle after explicit exclusions; its association with a named circuit configuration requires review. Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read. Some source ways lack one-way direction tags. Travel direction is provisional.

Identity: [OSM way 543915178](https://www.openstreetmap.org/way/543915178). Source geometry: [way 102145331](https://www.openstreetmap.org/way/102145331), [way 358560148](https://www.openstreetmap.org/way/358560148), [way 338068121](https://www.openstreetmap.org/way/338068121), [way 102145334](https://www.openstreetmap.org/way/102145334), [way 338068124](https://www.openstreetmap.org/way/338068124), [way 358560149](https://www.openstreetmap.org/way/358560149), [way 102145330](https://www.openstreetmap.org/way/102145330), [way 338068128](https://www.openstreetmap.org/way/338068128), [way 102146041](https://www.openstreetmap.org/way/102146041), [way 102145335](https://www.openstreetmap.org/way/102145335).

Pit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.

Remaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.

## Full racing circuit source correction, 2026-11-07

The generic longest-cycle fallback included training loops, their connectors and a way tagged as pit. The venue facilities description and published marshal-post map identify the racing circuit through Bane 1 and the outer Bane 2 course. Licensed imagery was inspected independently to distinguish those paths. No diagram coordinates or distance fitting are used.

The replacement follows exact pinned OSM way 102145330 version 18, indices 0 through 115, then way 338068128 version 2, indices 21 through 0. Both junctions share source node IDs exactly; no endpoint is snapped or joined with invented geometry. The previous recipe, source hashes, map hash and imagery reference remain in `sources/research/jyllandsringen-route-correction.json`.

GL, NY and their combined entry remain unchanged. NY still needs configuration and edge review; it is not replaced with the full circuit to match a distance. Main timing remains missing. Borders and playback require independent road-limit measurements; other layouts, borders and terrain are preserved.
