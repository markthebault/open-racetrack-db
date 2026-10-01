# Nürburgring source review

This is a first visual-preview draft. It uses only the pinned OpenStreetMap ways listed by its recipes for public course geometry. No reference track trace, map image, or track boundary is used. reference start/finish GPS is loaded separately from ignored .local/timing.json for this tailnet-only preview.

Source snapshot: sources/de-nurburgring/osm.json
Import manifest: sources/de-nurburgring/import.json

## Grand Prix, Sprint configuration preview

Recipe: sources/de-nurburgring/layouts/grand-prix.json

- Draft preview follows the OSM ways tagged Nürburgring Sprintstrecke and closes at the mapped timing-node way.
- The official full Grand Prix configuration is 5.148 km. This mapped loop is about 3.61 km; its relation to the full configuration needs route research.

Geometry: draft. Timing: local preview reference only; public timing is missing.

## Nordschleife full circuit

Recipe: sources/de-nurburgring/layouts/nordschleife.json

- Draft loop assembled along connected OSM raceway ways, retaining mapped one-way directions.
- The trace measures about 20.73 km against the operator reference of 20.832 km. Visual review and exact route closure review are still required.

Geometry: draft. Timing: local preview reference only; public timing is missing.

Review date: 2026-09-30. Reviewer: Codex preview implementation.

## Layout reconciliation, 2026-10-01

Nine reference timing names now have distinct selectable records. The GP route includes the arena and Müllenbach loop; Sprint remains separate. NLS follows the short GP connection with the arena; 24Hr and GP without MB Arena follow the OSM 24-hour arena bypass. Way 31010602 explicitly carries an estimated-connection note, so those routes remain draft. All joins use identical source nodes. No reference boundaries or nominal lengths select these routes.

BTG and Industry Pool reuse a supporting public Nordschleife loop and trim the private preview at separate timing projections. Lap Record is a timing convention on that loop. Independently reusable public endpoints remain missing. Recipe files, rather than the earlier two-layout notes above, describe the current routes.

Configuration identity references: [operator GP information](https://www.nuerburgring.de/info/nuerburgring/race-tracks/grand-prix-track?locale=en), [2025 24-hour regulations](https://24h-information.de/formulare/5588/24h_race_regulations_2025.en.pdf), and [operator NLS/short-link description](https://www.nuerburgring.de/en?locale=de), checked 2026-10-01. These support route configuration descriptions only; coordinates remain exclusively OSM.
