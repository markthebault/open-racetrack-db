# Circuit Zolder source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:29:40.804Z. SHA-256: `c266d40a3ed452e50c0058840d752369af01f95b9747e509ace4da76e0acad93`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No Racelogic boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Main circuit

Full course through the named Jacky Ickx chicane. The connecting bypass on way 288284741 is excluded.

4001.3 m from selected OSM geometry. 22 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Main circuit

Recipe: `layouts/main.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [399996030](https://www.openstreetmap.org/way/399996030), [399996031](https://www.openstreetmap.org/way/399996031), [400001988](https://www.openstreetmap.org/way/400001988), [444633116](https://www.openstreetmap.org/way/444633116), [399996032](https://www.openstreetmap.org/way/399996032), [400001987](https://www.openstreetmap.org/way/400001987), [43014732](https://www.openstreetmap.org/way/43014732), [444633113](https://www.openstreetmap.org/way/444633113), [444633112](https://www.openstreetmap.org/way/444633112), [400001985](https://www.openstreetmap.org/way/400001985), [400001986](https://www.openstreetmap.org/way/400001986), [399996022](https://www.openstreetmap.org/way/399996022), [399996023](https://www.openstreetmap.org/way/399996023), [399996024](https://www.openstreetmap.org/way/399996024), [444633115](https://www.openstreetmap.org/way/444633115), [399996025](https://www.openstreetmap.org/way/399996025), [399996021](https://www.openstreetmap.org/way/399996021), [444633114](https://www.openstreetmap.org/way/444633114), [399996026](https://www.openstreetmap.org/way/399996026), [399996027](https://www.openstreetmap.org/way/399996027), [399996028](https://www.openstreetmap.org/way/399996028), [399996029](https://www.openstreetmap.org/way/399996029).

Local timing association: start/finish XML record “Zolder”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
