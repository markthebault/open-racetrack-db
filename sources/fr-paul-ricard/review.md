# Circuit Paul Ricard source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:43:02.799Z. SHA-256: `d4d18385fb46bae74ffb1f5578982cb49811d6dfa4dd30a9dae957947c960d21`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No Racelogic boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Full circuit, Chicane Nord

Full course through the complete mapped Chicane Nord on way 229454180, the rounded Courbe de Signes on way 23463089 and the named Verrerie, Sainte-Baume, Beausset, Bendor and Pont sections. Pit ways, driving-center roads and connecting alternatives are excluded.

5846.3 m from selected OSM geometry. 23 pinned way slices. Shared OSM node IDs connect every join.

## Full circuit, Mistral straight

Full course uses the complete Mistral straight on way 686705519, bypassing Chicane Nord. The rounded Courbe de Signes and the remaining main-course sections are retained.

5764.5 m from selected OSM geometry. 21 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Full circuit, Chicane Nord

Recipe: `layouts/main.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [1209342418](https://www.openstreetmap.org/way/1209342418), [686705519](https://www.openstreetmap.org/way/686705519), [229454180](https://www.openstreetmap.org/way/229454180), [23463089](https://www.openstreetmap.org/way/23463089), [1282557464](https://www.openstreetmap.org/way/1282557464), [1282552677](https://www.openstreetmap.org/way/1282552677), [686700676](https://www.openstreetmap.org/way/686700676), [686700678](https://www.openstreetmap.org/way/686700678), [686700682](https://www.openstreetmap.org/way/686700682), [686700685](https://www.openstreetmap.org/way/686700685), [686700689](https://www.openstreetmap.org/way/686700689), [686700844](https://www.openstreetmap.org/way/686700844), [686705495](https://www.openstreetmap.org/way/686705495), [686705498](https://www.openstreetmap.org/way/686705498), [686705499](https://www.openstreetmap.org/way/686705499), [1209342415](https://www.openstreetmap.org/way/1209342415), [790806550](https://www.openstreetmap.org/way/790806550), [790806552](https://www.openstreetmap.org/way/790806552), [686705508](https://www.openstreetmap.org/way/686705508), [686705513](https://www.openstreetmap.org/way/686705513), [686705515](https://www.openstreetmap.org/way/686705515), [686705517](https://www.openstreetmap.org/way/686705517).

Local timing association: start/finish XML record “Paul Ricard 1C-V2”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.

### Full circuit, Mistral straight

Recipe: `layouts/mistral-straight.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [1209342418](https://www.openstreetmap.org/way/1209342418), [686705519](https://www.openstreetmap.org/way/686705519), [23463089](https://www.openstreetmap.org/way/23463089), [1282557464](https://www.openstreetmap.org/way/1282557464), [1282552677](https://www.openstreetmap.org/way/1282552677), [686700676](https://www.openstreetmap.org/way/686700676), [686700678](https://www.openstreetmap.org/way/686700678), [686700682](https://www.openstreetmap.org/way/686700682), [686700685](https://www.openstreetmap.org/way/686700685), [686700689](https://www.openstreetmap.org/way/686700689), [686700844](https://www.openstreetmap.org/way/686700844), [686705495](https://www.openstreetmap.org/way/686705495), [686705498](https://www.openstreetmap.org/way/686705498), [686705499](https://www.openstreetmap.org/way/686705499), [1209342415](https://www.openstreetmap.org/way/1209342415), [790806550](https://www.openstreetmap.org/way/790806550), [790806552](https://www.openstreetmap.org/way/790806552), [686705508](https://www.openstreetmap.org/way/686705508), [686705513](https://www.openstreetmap.org/way/686705513), [686705515](https://www.openstreetmap.org/way/686705515), [686705517](https://www.openstreetmap.org/way/686705517).

Local timing association: start/finish XML record “Paul Ricard 1A-V2”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
