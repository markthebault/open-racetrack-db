# Autodromo Enzo e Dino Ferrari source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:38:16.092Z. SHA-256: `94fc5a2bc5f42f405e8be450ac46f61d8f103b7fc915ba5b74dba613f24062ca`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No Racelogic boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix, without Variante Bassa

Main car course bypassing the mapped Variante Bassa chicane on way 1021771403. Tamburello, Villeneuve, Acque Minerali, Gresini and Rivazza are retained.

4904.5 m from selected OSM geometry. 32 pinned way slices. Shared OSM node IDs connect every join.

## With Variante Bassa

Mapped alternative through the Variante Bassa chicane using ways 1025616647, 1025616646 and 176764793.

4929.9 m from selected OSM geometry. 36 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix, without Variante Bassa

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [1021771398](https://www.openstreetmap.org/way/1021771398), [1025616640](https://www.openstreetmap.org/way/1025616640), [1021771397](https://www.openstreetmap.org/way/1021771397), [1021771396](https://www.openstreetmap.org/way/1021771396), [1021771395](https://www.openstreetmap.org/way/1021771395), [1025616642](https://www.openstreetmap.org/way/1025616642), [1021771394](https://www.openstreetmap.org/way/1021771394), [1025616643](https://www.openstreetmap.org/way/1025616643), [1025616641](https://www.openstreetmap.org/way/1025616641), [7920430](https://www.openstreetmap.org/way/7920430), [1021771393](https://www.openstreetmap.org/way/1021771393), [1025616657](https://www.openstreetmap.org/way/1025616657), [1021771400](https://www.openstreetmap.org/way/1021771400), [1025616656](https://www.openstreetmap.org/way/1025616656), [1021771399](https://www.openstreetmap.org/way/1021771399), [1021771402](https://www.openstreetmap.org/way/1021771402), [1025616655](https://www.openstreetmap.org/way/1025616655), [1025616653](https://www.openstreetmap.org/way/1025616653), [1025616654](https://www.openstreetmap.org/way/1025616654), [1021771401](https://www.openstreetmap.org/way/1021771401), [1025616652](https://www.openstreetmap.org/way/1025616652), [1025616651](https://www.openstreetmap.org/way/1025616651), [1025616650](https://www.openstreetmap.org/way/1025616650), [1021771404](https://www.openstreetmap.org/way/1021771404), [1025616648](https://www.openstreetmap.org/way/1025616648), [1025616649](https://www.openstreetmap.org/way/1025616649), [1021771403](https://www.openstreetmap.org/way/1021771403), [1025616645](https://www.openstreetmap.org/way/1025616645), [1025616644](https://www.openstreetmap.org/way/1025616644), [1025616638](https://www.openstreetmap.org/way/1025616638), [1025616639](https://www.openstreetmap.org/way/1025616639), [1021771405](https://www.openstreetmap.org/way/1021771405).

Local timing association: start/finish XML record “Imola - without chicane”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.

### With Variante Bassa

Recipe: `layouts/variante-bassa.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [1021771398](https://www.openstreetmap.org/way/1021771398), [1025616640](https://www.openstreetmap.org/way/1025616640), [1021771397](https://www.openstreetmap.org/way/1021771397), [1021771396](https://www.openstreetmap.org/way/1021771396), [1021771395](https://www.openstreetmap.org/way/1021771395), [1025616642](https://www.openstreetmap.org/way/1025616642), [1021771394](https://www.openstreetmap.org/way/1021771394), [1025616643](https://www.openstreetmap.org/way/1025616643), [1025616641](https://www.openstreetmap.org/way/1025616641), [7920430](https://www.openstreetmap.org/way/7920430), [1021771393](https://www.openstreetmap.org/way/1021771393), [1025616657](https://www.openstreetmap.org/way/1025616657), [1021771400](https://www.openstreetmap.org/way/1021771400), [1025616656](https://www.openstreetmap.org/way/1025616656), [1021771399](https://www.openstreetmap.org/way/1021771399), [1021771402](https://www.openstreetmap.org/way/1021771402), [1025616655](https://www.openstreetmap.org/way/1025616655), [1025616653](https://www.openstreetmap.org/way/1025616653), [1025616654](https://www.openstreetmap.org/way/1025616654), [1021771401](https://www.openstreetmap.org/way/1021771401), [1025616652](https://www.openstreetmap.org/way/1025616652), [1025616651](https://www.openstreetmap.org/way/1025616651), [1025616650](https://www.openstreetmap.org/way/1025616650), [1021771404](https://www.openstreetmap.org/way/1021771404), [1025616648](https://www.openstreetmap.org/way/1025616648), [1025616649](https://www.openstreetmap.org/way/1025616649), [1021771403](https://www.openstreetmap.org/way/1021771403), [1025616647](https://www.openstreetmap.org/way/1025616647), [1025616646](https://www.openstreetmap.org/way/1025616646), [176764793](https://www.openstreetmap.org/way/176764793), [1025616645](https://www.openstreetmap.org/way/1025616645), [1025616644](https://www.openstreetmap.org/way/1025616644), [1025616638](https://www.openstreetmap.org/way/1025616638), [1025616639](https://www.openstreetmap.org/way/1025616639), [1021771405](https://www.openstreetmap.org/way/1021771405).

Local timing association: start/finish XML record “Imola”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
