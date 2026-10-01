# Misano World Circuit source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:38:48.437Z. SHA-256: `446573a877b852c3e91170eb3e179525d9a140cc5c172f8d5cd14a694a4783da`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No reference boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## International, long circuit

Long course through Curva del Carro on way 624263857. The mapped short-course connector and MotoGP long-lap penalty detour are excluded.

4218.3 m from selected OSM geometry. 18 pinned way slices. Shared OSM node IDs connect every join.

## International, short circuit

Short course uses the mapped connector on way 230406260 in place of Curva del Carro. The MotoGP long-lap penalty detour is excluded.

4038.5 m from selected OSM geometry. 18 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

[Official Misano facility rules](https://www.misanocircuit.com/wp-content/uploads/2023/07/EN-IL01PSE-Regolamento_2023_07_06-2.pdf) identify long and short international courses. Their mapped OSM alternatives remain drafts; no coordinates are traced from the document.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### International, long circuit

Recipe: `layouts/main.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [624263856](https://www.openstreetmap.org/way/624263856), [624263851](https://www.openstreetmap.org/way/624263851), [624263855](https://www.openstreetmap.org/way/624263855), [624263850](https://www.openstreetmap.org/way/624263850), [624263854](https://www.openstreetmap.org/way/624263854), [624263849](https://www.openstreetmap.org/way/624263849), [624263853](https://www.openstreetmap.org/way/624263853), [624263848](https://www.openstreetmap.org/way/624263848), [1784572](https://www.openstreetmap.org/way/1784572), [624263852](https://www.openstreetmap.org/way/624263852), [624263860](https://www.openstreetmap.org/way/624263860), [624263859](https://www.openstreetmap.org/way/624263859), [624263858](https://www.openstreetmap.org/way/624263858), [624263845](https://www.openstreetmap.org/way/624263845), [624263847](https://www.openstreetmap.org/way/624263847), [624263844](https://www.openstreetmap.org/way/624263844), [624263857](https://www.openstreetmap.org/way/624263857), [624263846](https://www.openstreetmap.org/way/624263846).

Local timing association: start/finish XML record “Misano”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.

### International, short circuit

Recipe: `layouts/short.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [624263856](https://www.openstreetmap.org/way/624263856), [624263851](https://www.openstreetmap.org/way/624263851), [624263855](https://www.openstreetmap.org/way/624263855), [624263850](https://www.openstreetmap.org/way/624263850), [624263854](https://www.openstreetmap.org/way/624263854), [624263849](https://www.openstreetmap.org/way/624263849), [624263853](https://www.openstreetmap.org/way/624263853), [624263848](https://www.openstreetmap.org/way/624263848), [1784572](https://www.openstreetmap.org/way/1784572), [624263852](https://www.openstreetmap.org/way/624263852), [624263860](https://www.openstreetmap.org/way/624263860), [624263859](https://www.openstreetmap.org/way/624263859), [624263858](https://www.openstreetmap.org/way/624263858), [624263845](https://www.openstreetmap.org/way/624263845), [624263847](https://www.openstreetmap.org/way/624263847), [624263844](https://www.openstreetmap.org/way/624263844), [230406260](https://www.openstreetmap.org/way/230406260), [624263846](https://www.openstreetmap.org/way/624263846).

Local timing association: start/finish XML record “Misano”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
