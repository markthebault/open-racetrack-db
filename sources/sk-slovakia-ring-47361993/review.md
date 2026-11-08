# Slovakia Ring

Geometry: **draft**. Public timing: **missing**. Inspector: Codex, 2026-09-30.

Parent country snapshot: `europe/sk/osm.json`, SHA-256 `ca36dbcf3b061de851d04880fd17670cfe0f69620cad3d1d39d8cec32f46c35b`. Venue subset SHA-256: `97d4cb6199f3b08bbad73930b2924425a65e4ff97e7e1a0cdcf368326fa1804d`.

## Previous connected course candidate (superseded)

Recipe: `layouts/main.json`. Approximate trace length: 6172.8 m. Candidate count: 30. Connected OSM course candidate. The selected loop is the longest simple source-node cycle after explicit exclusions; its association with a named circuit configuration requires review. Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read. Some source ways lack one-way direction tags. Travel direction is provisional.

Identity: [OSM way 52218855](https://www.openstreetmap.org/way/52218855). Source geometry: [way 47378777](https://www.openstreetmap.org/way/47378777), [way 47378779](https://www.openstreetmap.org/way/47378779), [way 47378308](https://www.openstreetmap.org/way/47378308), [way 1422356971](https://www.openstreetmap.org/way/1422356971), [way 47373776](https://www.openstreetmap.org/way/47373776), [way 47378311](https://www.openstreetmap.org/way/47378311), [way 47378778](https://www.openstreetmap.org/way/47378778), [way 1422356970](https://www.openstreetmap.org/way/1422356970), [way 47373775](https://www.openstreetmap.org/way/47373775), [way 47378776](https://www.openstreetmap.org/way/47378776), [way 47361993](https://www.openstreetmap.org/way/47361993), [way 47373778](https://www.openstreetmap.org/way/47373778), [way 1422356969](https://www.openstreetmap.org/way/1422356969), [way 47373780](https://www.openstreetmap.org/way/47373780), [way 47378085](https://www.openstreetmap.org/way/47378085), [way 47378083](https://www.openstreetmap.org/way/47378083), [way 47374306](https://www.openstreetmap.org/way/47374306), [way 47374313](https://www.openstreetmap.org/way/47374313).

Pit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.

Remaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.

## Full-circuit source correction, 2026-11-07

The generic `main` longest-cycle hypothesis contained three extra connector detours. The operator variant-4 map marks the rounded northeastern turn and southern infield returns as the racing route, with these connectors outside the red route. Pinned licensed imagery confirms the paved bend and junction arrangement. `main` now uses the exact existing independently selected source chain in `selected-network-47361993.json`, SHA-256 `d2617de8aa2ad326da9391e4f245745a9afcf888982b30b0b15f1224fa1397f1`. Source coordinates are not fitted to the official length or traced from the operator diagram. The official V4b chicane is a separate configuration; this correction does not claim to model it.

The previous recipe, source pins and primary identity links are retained in `sources/research/slovakia-route-correction.json`. The separately named layout, all existing borders, timing and terrain are unchanged. Main timing remains missing and geometry remains draft. New main borders require independent inference and native-image screening; no sibling timing, border pair or model is copied.
