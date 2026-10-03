# Igora Drive

Geometry: **draft**. Public timing: **missing**. Inspector: Codex, 2026-09-30.

Parent country snapshot: `europe/ru/osm.json`, SHA-256 `218a5c88feffa58bf889155f43221681659b49ea85dfd9c389b99734872d6f99`. Venue subset SHA-256: `d888f93c9173d703941514d8b490b40eb5d96cb5b3aaa9cb19da4e59b5ed9c46`.

## Connected course candidate

Recipe: `layouts/main.json`. Approximate trace length: 5198.7 m. Candidate count: 11. Connected OSM course candidate. The selected loop is the longest simple source-node cycle after explicit exclusions; its association with a named circuit configuration requires review. Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read.

Identity: [OSM way 526474749](https://www.openstreetmap.org/way/526474749). Source geometry: [way 491591561](https://www.openstreetmap.org/way/491591561), [way 729149906](https://www.openstreetmap.org/way/729149906), [way 491591560](https://www.openstreetmap.org/way/491591560), [way 1314505677](https://www.openstreetmap.org/way/1314505677).

Pit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.

Remaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.

## Identified main courses — 2026-10-02

The earlier unnamed 5,198.7 m candidate is superseded. It used the northern crossover (729149906 and part of 491591560), which is excluded from the operator-identified full main course. The public `identified-national-and-grand-prix.json` snapshot pins the full main way 491591561 v12 and southern extension 1314505677 v2. Its parent acquisition and hash are preserved in `course-networks/igora-drive-2026-independent-course/`.

`layouts/main.json` now selects the complete northern sector and the exact shared-node southern extension for the operator's [July 2022 Grand Prix course](https://drive-igora.ru/news/2022/07/21/otkrytie-novoy-konfiguratsii-shosseyno-koltsevoy-trassy-avtodroma-igora-drayv.html): 5,183.1 m from public map nodes, compared with the published 5,183 m. No source coordinates are altered to that figure.

`layouts/national.json` retains the complete main way and old southern return, excluding the extension: 4,093.4 m compared with the operator's 4,086 m. The operator confirms this [short configuration remained in use in September 2026](https://drive-igora.ru/news/2026/09/16/iv-etap-igora-drayv-taym-atak-nazovet-imena-chempionov-sezona-2026-goda.html). Northern shortcuts, pits and other facility circuits are excluded from both recipes. Source way direction is retained; fine racing-line alignment remains draft. Neither layout has reusable start/finish coordinates.

The generic archive filename identifies this venue but has no timing-XML record or configuration suffix. These independent public layouts do not by themselves reconcile which one that file represents; the filename gap remains explicit.
