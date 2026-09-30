# Circuit Ricardo Tormo source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:42:40.530Z. SHA-256: `6f52790b1769bdea113fcacf0e4df610d8ec1ce3b56348c0f4b9f5f070a3e425`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No Racelogic boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix

Complete main loop on ways 1336518434, 51765219 and 1007068425. Formula E connectors, Shortcut 1, pit lane and MotoGP long-lap detour are excluded. Route order is counterclockwise; OSM direction tags are absent.

3999.8 m from selected OSM geometry. 3 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix

Recipe: `layouts/grand-prix.json`. Direction: selected counterclockwise traversal is provisional; OSM ways lack explicit one-way direction tags.

Selected OSM ways: [1336518434](https://www.openstreetmap.org/way/1336518434), [51765219](https://www.openstreetmap.org/way/51765219), [1007068425](https://www.openstreetmap.org/way/1007068425).

Local timing association: start/finish XML record “Circuit Ricardo Tormo Valencia”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
