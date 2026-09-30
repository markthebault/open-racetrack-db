# Le Mans Bugatti Circuit source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:41:11.711Z. SHA-256: `cd105c44d9e6637e7f77b2079dae63055c3e5c6021b884399fbac79752b607ea`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No Racelogic boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Bugatti circuit

Closed Bugatti course through Dunlop, La Chapelle, Musée, Garage Vert, Chemin aux Bœufs, Garage Bleu and Raccordement. The 24-hour circuit branches, Porsche Center roads, pit entries/exits and long-lap penalty detour are excluded.

4163.5 m from selected OSM geometry. 18 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Bugatti circuit

Recipe: `layouts/main.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [1101935464](https://www.openstreetmap.org/way/1101935464), [2313153](https://www.openstreetmap.org/way/2313153), [1101935465](https://www.openstreetmap.org/way/1101935465), [1101935466](https://www.openstreetmap.org/way/1101935466), [258242164](https://www.openstreetmap.org/way/258242164), [773623629](https://www.openstreetmap.org/way/773623629), [773623628](https://www.openstreetmap.org/way/773623628), [1101935455](https://www.openstreetmap.org/way/1101935455), [773623626](https://www.openstreetmap.org/way/773623626), [773623627](https://www.openstreetmap.org/way/773623627), [1101935457](https://www.openstreetmap.org/way/1101935457), [1101935456](https://www.openstreetmap.org/way/1101935456), [1101935458](https://www.openstreetmap.org/way/1101935458), [1101935459](https://www.openstreetmap.org/way/1101935459), [1101935460](https://www.openstreetmap.org/way/1101935460), [1101935461](https://www.openstreetmap.org/way/1101935461), [1101935462](https://www.openstreetmap.org/way/1101935462), [1101935463](https://www.openstreetmap.org/way/1101935463).

Local timing association: start/finish XML record “Le Mans Bugatti”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
