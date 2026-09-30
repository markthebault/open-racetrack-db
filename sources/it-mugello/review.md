# Mugello Circuit source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:39:37.678Z. SHA-256: `65f0eee2c23ac431ab858174d37789a6e7ddc7315c0bbd7e638d7d6203af1348`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No Racelogic boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix

Full course through San Donato, Luco, Poggio Secco, both Arrabbiata corners, Correntaio, Biondetti and Bucine. Separate Mugellino ways, bypasses and pit lanes are excluded.

5244.8 m from selected OSM geometry. 42 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [881284136](https://www.openstreetmap.org/way/881284136), [612265027](https://www.openstreetmap.org/way/612265027), [881284137](https://www.openstreetmap.org/way/881284137), [612265024](https://www.openstreetmap.org/way/612265024), [881284138](https://www.openstreetmap.org/way/881284138), [612265023](https://www.openstreetmap.org/way/612265023), [881284139](https://www.openstreetmap.org/way/881284139), [881284140](https://www.openstreetmap.org/way/881284140), [612265020](https://www.openstreetmap.org/way/612265020), [612265021](https://www.openstreetmap.org/way/612265021), [612265019](https://www.openstreetmap.org/way/612265019), [881284142](https://www.openstreetmap.org/way/881284142), [881284143](https://www.openstreetmap.org/way/881284143), [881284144](https://www.openstreetmap.org/way/881284144), [612265017](https://www.openstreetmap.org/way/612265017), [881284145](https://www.openstreetmap.org/way/881284145), [612265016](https://www.openstreetmap.org/way/612265016), [881284146](https://www.openstreetmap.org/way/881284146), [881284147](https://www.openstreetmap.org/way/881284147), [612265004](https://www.openstreetmap.org/way/612265004), [612265001](https://www.openstreetmap.org/way/612265001), [612265013](https://www.openstreetmap.org/way/612265013), [612265012](https://www.openstreetmap.org/way/612265012), [881284149](https://www.openstreetmap.org/way/881284149), [612265010](https://www.openstreetmap.org/way/612265010), [612265008](https://www.openstreetmap.org/way/612265008), [612265009](https://www.openstreetmap.org/way/612265009), [612265011](https://www.openstreetmap.org/way/612265011), [612265034](https://www.openstreetmap.org/way/612265034), [612265032](https://www.openstreetmap.org/way/612265032), [612265031](https://www.openstreetmap.org/way/612265031), [881284124](https://www.openstreetmap.org/way/881284124), [881284125](https://www.openstreetmap.org/way/881284125), [881284126](https://www.openstreetmap.org/way/881284126), [881284127](https://www.openstreetmap.org/way/881284127), [612265029](https://www.openstreetmap.org/way/612265029), [881284128](https://www.openstreetmap.org/way/881284128), [881284130](https://www.openstreetmap.org/way/881284130), [1373584890](https://www.openstreetmap.org/way/1373584890), [881284133](https://www.openstreetmap.org/way/881284133), [881284134](https://www.openstreetmap.org/way/881284134), [881284135](https://www.openstreetmap.org/way/881284135).

Local timing association: start/finish XML record “Mugello”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
