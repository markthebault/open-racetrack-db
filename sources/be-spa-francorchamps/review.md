# Circuit de Spa-Francorchamps source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:23:42.820Z. SHA-256: `20d9fb8967ebc04bbb2a668ac579e8f8a7461f0000fd121241b69f04725399e1`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No reference boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix

Full course through the car Speaker’s Corner on way 126807106. The separately mapped motorcycle alternative, karting course and pit lanes are excluded.

6994.7 m from selected OSM geometry. 30 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [1430527230](https://www.openstreetmap.org/way/1430527230), [24449918](https://www.openstreetmap.org/way/24449918), [126807113](https://www.openstreetmap.org/way/126807113), [175195997](https://www.openstreetmap.org/way/175195997), [126807111](https://www.openstreetmap.org/way/126807111), [126807112](https://www.openstreetmap.org/way/126807112), [1359025268](https://www.openstreetmap.org/way/1359025268), [126807106](https://www.openstreetmap.org/way/126807106), [1359025267](https://www.openstreetmap.org/way/1359025267), [126807103](https://www.openstreetmap.org/way/126807103), [126807101](https://www.openstreetmap.org/way/126807101), [126807109](https://www.openstreetmap.org/way/126807109), [126807116](https://www.openstreetmap.org/way/126807116), [175371353](https://www.openstreetmap.org/way/175371353), [175371365](https://www.openstreetmap.org/way/175371365), [126807100](https://www.openstreetmap.org/way/126807100), [176133746](https://www.openstreetmap.org/way/176133746), [126807114](https://www.openstreetmap.org/way/126807114), [176133745](https://www.openstreetmap.org/way/176133745), [178964809](https://www.openstreetmap.org/way/178964809), [126807105](https://www.openstreetmap.org/way/126807105), [637268672](https://www.openstreetmap.org/way/637268672), [613486590](https://www.openstreetmap.org/way/613486590), [126807099](https://www.openstreetmap.org/way/126807099), [175178443](https://www.openstreetmap.org/way/175178443), [175178448](https://www.openstreetmap.org/way/175178448), [126807110](https://www.openstreetmap.org/way/126807110), [126835639](https://www.openstreetmap.org/way/126835639), [126835637](https://www.openstreetmap.org/way/126835637), [126835638](https://www.openstreetmap.org/way/126835638).

Local timing association: start/finish XML record “Spa Francorchamps”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
