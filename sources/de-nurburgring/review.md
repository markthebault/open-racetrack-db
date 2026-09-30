# Nürburgring source review

This is a first visual-preview draft. It uses only the pinned OpenStreetMap ways listed by its recipes for public course geometry. No Racelogic track trace, map image, or track boundary is used. Racelogic start/finish GPS is loaded separately from ignored .local/timing.json for this tailnet-only preview.

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
