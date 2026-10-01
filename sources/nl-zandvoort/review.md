# Circuit Zandvoort source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:35:55.929Z. SHA-256: `42e3da1f4d6e2e934b018c4c60bf296cce909b7fa72aa497e28ed9cd5f1e616a`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No reference boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix

Full course through the named Tarzan, Hugenholtz, Scheivlak, Hans Ernst and Arie Luyendyk corners. Old connecting ways and Pitstraat are excluded.

4253.2 m from selected OSM geometry. 24 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [1311822341](https://www.openstreetmap.org/way/1311822341), [1311879069](https://www.openstreetmap.org/way/1311879069), [1311522211](https://www.openstreetmap.org/way/1311522211), [1311522212](https://www.openstreetmap.org/way/1311522212), [1313671989](https://www.openstreetmap.org/way/1313671989), [1311522213](https://www.openstreetmap.org/way/1311522213), [1313671990](https://www.openstreetmap.org/way/1313671990), [1311522214](https://www.openstreetmap.org/way/1311522214), [1311522215](https://www.openstreetmap.org/way/1311522215), [1311522216](https://www.openstreetmap.org/way/1311522216), [1311522217](https://www.openstreetmap.org/way/1311522217), [1311522218](https://www.openstreetmap.org/way/1311522218), [1311566938](https://www.openstreetmap.org/way/1311566938), [1311566937](https://www.openstreetmap.org/way/1311566937), [1313671991](https://www.openstreetmap.org/way/1313671991), [1311566939](https://www.openstreetmap.org/way/1311566939), [1313671992](https://www.openstreetmap.org/way/1313671992), [1311566940](https://www.openstreetmap.org/way/1311566940), [1311710253](https://www.openstreetmap.org/way/1311710253), [24626850](https://www.openstreetmap.org/way/24626850), [1311765615](https://www.openstreetmap.org/way/1311765615), [1311802779](https://www.openstreetmap.org/way/1311802779), [1311822339](https://www.openstreetmap.org/way/1311822339), [1311822340](https://www.openstreetmap.org/way/1311822340).

Local timing association: start/finish XML record “Zandvoort”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
