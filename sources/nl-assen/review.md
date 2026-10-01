# TT Circuit Assen source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:36:18.956Z. SHA-256: `4c3bdcb47f73fde96de536f8d23e0e6cdbe2e3c8ace39f3c3bcf743aa40836af`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No reference boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Main circuit

Complete closed TT Circuit way 359172905. The Junior Track, connecting shortcuts and alternative loops are excluded.

4547.4 m from selected OSM geometry. 1 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Main circuit

Recipe: `layouts/main.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [359172905](https://www.openstreetmap.org/way/359172905).

Local timing association: start/finish XML record “Assen”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
