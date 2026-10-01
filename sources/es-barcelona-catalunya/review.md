# Circuit de Barcelona-Catalunya source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:41:13.515Z. SHA-256: `052fbe44e6a061bd87faab98074deb937600ac71843cedafd90aefae6a59c7b4`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No reference boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix, without final chicane

Full course uses the mapped Turn 10 arc on way 893732520 and the direct final corners on way 1560896066. The final-sector chicane, Nissan alternative, short-course connector and long-lap penalty detour are excluded.

4661.2 m from selected OSM geometry. 7 pinned way slices. Shared OSM node IDs connect every join.

## Grand Prix, with final chicane

Same Turn 10 arc as the main course, with the mapped final-sector chicane on ways 1057826347 and 967275593. The Nissan alternative and long-lap penalty detour are excluded.

4634.9 m from selected OSM geometry. 9 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

[Official layout reference](https://www.circuitcat.com/en/news/formula-1/the-formula-1-aws-gran-premio-de-espana-2023-changes-its-track-configuration/). Identifies Grand Prix configurations with and without the final chicane. Reference only; all coordinates come from OSM.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix, without final chicane

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [893732520](https://www.openstreetmap.org/way/893732520), [831804325](https://www.openstreetmap.org/way/831804325), [990483278](https://www.openstreetmap.org/way/990483278), [831804327](https://www.openstreetmap.org/way/831804327), [1560896065](https://www.openstreetmap.org/way/1560896065), [1560896066](https://www.openstreetmap.org/way/1560896066), [1560896061](https://www.openstreetmap.org/way/1560896061).

Local timing association: start/finish XML record “Catalunya GP”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.

### Grand Prix, with final chicane

Recipe: `layouts/with-chicane.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [893732520](https://www.openstreetmap.org/way/893732520), [831804325](https://www.openstreetmap.org/way/831804325), [990483278](https://www.openstreetmap.org/way/990483278), [831804327](https://www.openstreetmap.org/way/831804327), [1560896065](https://www.openstreetmap.org/way/1560896065), [1057826347](https://www.openstreetmap.org/way/1057826347), [967275593](https://www.openstreetmap.org/way/967275593), [1560896066](https://www.openstreetmap.org/way/1560896066), [1560896061](https://www.openstreetmap.org/way/1560896061).

Local timing association: start/finish XML record “Catalunya”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
