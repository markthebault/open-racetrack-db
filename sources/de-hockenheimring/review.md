# Hockenheimring source review

Geometry: **draft**. Timing in the reusable database: **missing**.

Snapshot retrieved 2026-09-30T16:23:26.985Z. SHA-256: `73060c2ca77e5046c559eabfe02a0875dc5bb453e7b377ea3ad84f1fe6d5684c`.

[OSM attribution and license](https://www.openstreetmap.org/copyright). [FIA venue reference](https://www.fia.com/sites/default/files/circuits_fia20251201.pdf), naming only.

No reference boundary, CIR, or track-map data is read. Private start/finish XML references are served separately by the local preview and excluded from public GeoJSON. Each route uses exact source node connectivity; no gaps are filled by proximity.

## Grand Prix

Full course through Spitzkehre and the stadium; shortcut, rallycross, drag-strip and pit ways excluded.

4564.7 m from selected OSM geometry. 17 pinned way slices. Shared OSM node IDs connect every join.

## National circuit

Mapped Parabolika shortcut on way 339948104; the long Spitzkehre loop is excluded.

3688.1 m from selected OSM geometry. 16 pinned way slices. Shared OSM node IDs connect every join.

## Short circuit

Mapped Kleiner Kurs Kurzanbindung on way 22940941; optional Schikanenvariante excluded.

2604.3 m from selected OSM geometry. 11 pinned way slices. Shared OSM node IDs connect every join.

Independent visual/layout confirmation and a reusable start/finish source are still required before marking these layouts reviewed.

## Implementation inspection

Date: 2026-09-30T16:50:42.118759+00:00. Inspector: Codex. Checked pinned source connectivity, route closure, one-way tags, exclusions, calculated lengths, and the generated route plot. These checks do not constitute independent confirmation of every layout; geometry remains draft.

### Grand Prix

Recipe: `layouts/grand-prix.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [117568831](https://www.openstreetmap.org/way/117568831), [117570493](https://www.openstreetmap.org/way/117570493), [446193573](https://www.openstreetmap.org/way/446193573), [117570506](https://www.openstreetmap.org/way/117570506), [117570503](https://www.openstreetmap.org/way/117570503), [117570502](https://www.openstreetmap.org/way/117570502), [117570507](https://www.openstreetmap.org/way/117570507), [15444543](https://www.openstreetmap.org/way/15444543), [117570511](https://www.openstreetmap.org/way/117570511), [117570513](https://www.openstreetmap.org/way/117570513), [117570496](https://www.openstreetmap.org/way/117570496), [117570499](https://www.openstreetmap.org/way/117570499), [117568832](https://www.openstreetmap.org/way/117568832), [117568833](https://www.openstreetmap.org/way/117568833), [117568830](https://www.openstreetmap.org/way/117568830), [1386056979](https://www.openstreetmap.org/way/1386056979).

Local timing association: start/finish XML record “Hockenheim GP”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.

### National circuit

Recipe: `layouts/national.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [117568831](https://www.openstreetmap.org/way/117568831), [117570493](https://www.openstreetmap.org/way/117570493), [446193573](https://www.openstreetmap.org/way/446193573), [117570506](https://www.openstreetmap.org/way/117570506), [339948104](https://www.openstreetmap.org/way/339948104), [117570507](https://www.openstreetmap.org/way/117570507), [15444543](https://www.openstreetmap.org/way/15444543), [117570511](https://www.openstreetmap.org/way/117570511), [117570513](https://www.openstreetmap.org/way/117570513), [117570496](https://www.openstreetmap.org/way/117570496), [117570499](https://www.openstreetmap.org/way/117570499), [117568832](https://www.openstreetmap.org/way/117568832), [117568833](https://www.openstreetmap.org/way/117568833), [117568830](https://www.openstreetmap.org/way/117568830), [1386056979](https://www.openstreetmap.org/way/1386056979).

Local timing association: start/finish XML record “Hockenheimring National”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.

### Short circuit

Recipe: `layouts/short.json`. Direction: follows explicit OSM `oneway=yes` order on every selected way.

Selected OSM ways: [22940941](https://www.openstreetmap.org/way/22940941), [15444543](https://www.openstreetmap.org/way/15444543), [117570511](https://www.openstreetmap.org/way/117570511), [117570513](https://www.openstreetmap.org/way/117570513), [117570496](https://www.openstreetmap.org/way/117570496), [117570499](https://www.openstreetmap.org/way/117570499), [117568832](https://www.openstreetmap.org/way/117568832), [117568833](https://www.openstreetmap.org/way/117568833), [117568830](https://www.openstreetmap.org/way/117568830), [1386056979](https://www.openstreetmap.org/way/1386056979), [117568831](https://www.openstreetmap.org/way/117568831).

Local timing association: start/finish XML record “Hockenheimring Short Track”. Original GPS center retained; 25 m perpendicular display endpoints are estimated from the OSM tangent. A close alignment is a consistency check, not a rights or survey verification. No timing coordinates are published in this review or public GeoJSON.
