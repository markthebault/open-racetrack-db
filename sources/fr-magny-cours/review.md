# Circuit de Nevers Magny-Cours source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:43:04.719Z. SHA-256: `8b08d653162b967b2af756dc1367df94583e1352982fdb9fc89d6a0f7cd46ae7`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No reference boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix

Complete closed main-course way 63951656. Separate Club circuit ways and pit lanes are excluded. Its approximate OSM length is 4.46 km; the FIA nominal length is 4.411 km, so geometry remains a draft.

4457.8 m from selected OSM geometry. 1 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [63951656](https://www.openstreetmap.org/way/63951656).

Local timing association: start/finish XML record “Magny Cours”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
