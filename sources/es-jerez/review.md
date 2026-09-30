# Circuito de Jerez source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:41:15.509Z. SHA-256: `12e5f2bf52d7c6b083e3dad2e273e2fafe029a960c0507e054c04b0700f6798d`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No Racelogic boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Car circuit, Senna chicane

Full course through the mapped Chicane Senna on way 773658478; the Alex Criville bypass is excluded.

4430.0 m from selected OSM geometry. 22 pinned way slices. Shared OSM node IDs connect every join.

## Motorcycle circuit, without chicane

Full course through Curva Alex Criville on way 2497152 instead of the mapped Senna chicane.

4425.7 m from selected OSM geometry. 22 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

[Official layout reference](https://circuitodejerez.com/en/circuito/). Identifies the car circuit with Senna chicane and the motorcycle circuit without it. Reference only; all coordinates come from OSM.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Car circuit, Senna chicane

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [773658472](https://www.openstreetmap.org/way/773658472), [773658473](https://www.openstreetmap.org/way/773658473), [773658474](https://www.openstreetmap.org/way/773658474), [773658475](https://www.openstreetmap.org/way/773658475), [773658476](https://www.openstreetmap.org/way/773658476), [773658477](https://www.openstreetmap.org/way/773658477), [773658478](https://www.openstreetmap.org/way/773658478), [773658479](https://www.openstreetmap.org/way/773658479), [773658480](https://www.openstreetmap.org/way/773658480), [773658481](https://www.openstreetmap.org/way/773658481), [773658482](https://www.openstreetmap.org/way/773658482), [773658483](https://www.openstreetmap.org/way/773658483), [80864063](https://www.openstreetmap.org/way/80864063), [80804175](https://www.openstreetmap.org/way/80804175), [773658465](https://www.openstreetmap.org/way/773658465), [773658466](https://www.openstreetmap.org/way/773658466), [773658467](https://www.openstreetmap.org/way/773658467), [773658468](https://www.openstreetmap.org/way/773658468), [2497139](https://www.openstreetmap.org/way/2497139), [773658469](https://www.openstreetmap.org/way/773658469), [773658470](https://www.openstreetmap.org/way/773658470), [773658471](https://www.openstreetmap.org/way/773658471).

Local timing association: start/finish XML record “Jerez”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.

### Motorcycle circuit, without chicane

Recipe: `layouts/motorcycle.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [773658472](https://www.openstreetmap.org/way/773658472), [773658473](https://www.openstreetmap.org/way/773658473), [773658474](https://www.openstreetmap.org/way/773658474), [773658475](https://www.openstreetmap.org/way/773658475), [773658476](https://www.openstreetmap.org/way/773658476), [773658477](https://www.openstreetmap.org/way/773658477), [2497152](https://www.openstreetmap.org/way/2497152), [773658479](https://www.openstreetmap.org/way/773658479), [773658480](https://www.openstreetmap.org/way/773658480), [773658481](https://www.openstreetmap.org/way/773658481), [773658482](https://www.openstreetmap.org/way/773658482), [773658483](https://www.openstreetmap.org/way/773658483), [80864063](https://www.openstreetmap.org/way/80864063), [80804175](https://www.openstreetmap.org/way/80804175), [773658465](https://www.openstreetmap.org/way/773658465), [773658466](https://www.openstreetmap.org/way/773658466), [773658467](https://www.openstreetmap.org/way/773658467), [773658468](https://www.openstreetmap.org/way/773658468), [2497139](https://www.openstreetmap.org/way/2497139), [773658469](https://www.openstreetmap.org/way/773658469), [773658470](https://www.openstreetmap.org/way/773658470), [773658471](https://www.openstreetmap.org/way/773658471).

Local timing association: start/finish XML record “Jerez”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
