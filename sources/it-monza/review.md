# Autodromo Nazionale Monza source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:36:36.836Z. SHA-256: `785b2e530a5352c734637e637fcc8b9f44a2d19270d20b8049511c59bafd1f0f`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No reference boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix

Main road course through Variante del Rettifilo, Variante della Roggia, both Lesmo corners, Variante Ascari and Curva Alboreto. The historic banked oval, Junior loop and chicane bypasses are excluded.

5794.1 m from selected OSM geometry. 20 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [179968226](https://www.openstreetmap.org/way/179968226), [179968249](https://www.openstreetmap.org/way/179968249), [179968239](https://www.openstreetmap.org/way/179968239), [179968257](https://www.openstreetmap.org/way/179968257), [179968234](https://www.openstreetmap.org/way/179968234), [19842206](https://www.openstreetmap.org/way/19842206), [179968242](https://www.openstreetmap.org/way/179968242), [179968264](https://www.openstreetmap.org/way/179968264), [179968220](https://www.openstreetmap.org/way/179968220), [179968262](https://www.openstreetmap.org/way/179968262), [179968245](https://www.openstreetmap.org/way/179968245), [179968263](https://www.openstreetmap.org/way/179968263), [179968229](https://www.openstreetmap.org/way/179968229), [179968251](https://www.openstreetmap.org/way/179968251), [179968230](https://www.openstreetmap.org/way/179968230), [179968252](https://www.openstreetmap.org/way/179968252), [179968228](https://www.openstreetmap.org/way/179968228), [1443867792](https://www.openstreetmap.org/way/1443867792), [1443867793](https://www.openstreetmap.org/way/1443867793), [179968254](https://www.openstreetmap.org/way/179968254).

Local timing association: start/finish XML record “Monza”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
