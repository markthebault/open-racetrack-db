# Pilot venues and research plan

## 1. Required pilot

Start with three venues in three countries. They were already explored in the local prototype, so the maintainer can compare the user experience.

The minimum target is six selectable entries: five physical courses and one timing variant. Names in the table are working labels. Verify them independently before marking records reviewed.

| Country | Venue ID | Layout ID | Working display name | Final trace | Timing |
| --- | --- | --- | --- | --- | --- |
| Austria | `at-salzburgring` | `grand-prix` | Main circuit | Closed | Shared start/finish |
| France | `fr-anneau-du-rhin` | `3-0-km` | 3.0 km layout | Closed | Shared start/finish, subject to source check |
| France | `fr-anneau-du-rhin` | `3-7-km` | 3.7 km layout | Closed | Shared start/finish, subject to source check |
| Germany | `de-nurburgring` | `grand-prix` | Grand Prix circuit | Closed | Shared start/finish, subject to event convention |
| Germany | `de-nurburgring` | `nordschleife` | Nordschleife full circuit | Closed | Full-lap start/finish convention to verify |
| Germany | `de-nurburgring` | `nordschleife-btg` | Nordschleife Bridge to Gantry | Open | Separate start and finish |

Default layouts: Salzburgring `grand-prix`, Anneau du Rhin `3-7-km`, Nürburgring `nordschleife`.

Bridge to Gantry is a timing variant of the Nordschleife. Explain that in its description. It is not an additional physical circuit. The open displayed trace covers the sourced start-to-finish portion, not a fabricated closed BTG loop.

The contract supports this distinction without a separate timing-configuration database. Small route-recipe duplication is acceptable for six entries. Do not build inheritance or a layout composition language.

If independent evidence contradicts a working name, document the finding and use a supported display name. Keep stable IDs unless they would misidentify the course. If a required route cannot be identified, record it as blocked. Do not count a different unrequested route as completion without explaining the scope change to the maintainer.

## 2. Optional after the required entries

Anneau du Rhin layout C is the first optional candidate, if independent evidence identifies it. Nürburgring Sprint, GP without Arena, 24-hour, and NLS combinations come later.

Do not add these while required entries remain unresearched merely to increase the layout count. A fourth venue is unnecessary for the first milestone. The requested three-to-four-venue range is satisfied by these three venues.

## 3. Evidence available from prior exploration

An OSM survey was fetched on 2026-09-30. Its reported OSM base timestamp is `2026-09-30T14:45:59Z`. These observations are research leads, not completed layout recipes.

The local survey is available at:

```text
/Users/mth-solvd/Documents/Codex/2026-09-30/i-x20/work/osm-pilot/extract.json
```

This is a disposable research input. The implementation must create sanitized, venue-specific snapshots in the new repository. If the local file is unavailable, fetch fresh OSM data and record its actual date. Never fabricate the old snapshot date.

Bounds below use GeoJSON order: `[west, south, east, north]`. Convert them to south, west, north, east for an Overpass query.

| Venue | Initial search bounds | Prior candidate count |
| --- | --- | --- |
| Salzburgring | `[13.14, 47.81, 13.19, 47.84]` | 13 raceway ways; no timing-tagged node found |
| Anneau du Rhin | `[7.39, 47.93, 7.45, 47.97]` | 13 raceway ways; no timing-tagged node found |
| Nürburgring | `[6.89, 50.31, 7.04, 50.40]` | 98 raceway ways; one timing-tagged node found |

Counts reflect the query and date. They do not prove completeness or current conditions. Absence of a node in this search does not prove that no timing evidence exists elsewhere.

## 4. Salzburgring

Purpose: establish the simplest closed-route import and one shared gate.

Useful OSM leads:

- [Way 768072836](https://www.openstreetmap.org/way/768072836), named `Start` in the snapshot. This is a road segment, not an exact timing line.
- [Way 768072838](https://www.openstreetmap.org/way/768072838), named `Gegengerade`.
- [Way 768072839](https://www.openstreetmap.org/way/768072839), named `Nocksteinkehre`.
- [Way 23840098](https://www.openstreetmap.org/way/23840098), named `Fahrerlagerkurve`.
- [Way 71295606](https://www.openstreetmap.org/way/71295606), named `Boxengasse`; inspect and exclude the pit route.
- [Way 64454986](https://www.openstreetmap.org/way/64454986), a training loop to exclude.
- [Way 770423162](https://www.openstreetmap.org/way/770423162), tagged `area=yes`; exclude from the route trace.

Required research:

1. Assemble the main course through its chicanes and return section.
2. Confirm travel direction and the intended course configuration.
3. Inspect all joins, especially pit and training-area connections.
4. Find independently reusable start/finish evidence.
5. Record any missing timing evidence explicitly.

Do not derive the start/finish point from the midpoint of the way called `Start`. The shared gate is currently an evidence gap.

## 5. Anneau du Rhin

Purpose: prove that layout selection changes the actual course at one venue.

Useful OSM leads:

- [Way 40816550](https://www.openstreetmap.org/way/40816550), named `Circuit de L'Anneau du Rhin - Alternative`, version 21 in the snapshot.
- [Way 1079812809](https://www.openstreetmap.org/way/1079812809), named `Circuit de L'Anneau du Rhin - Biltzheim`, version 4.
- Ways 215520132, 215520134, 215520135, 215520136, 215520137, and 215520138 are candidate connecting sections.
- [Way 444369379](https://www.openstreetmap.org/way/444369379), named `Loisir 4.0 KM`, represents only a small mapped piece. The name is not proof of a complete 4 km route.
- Ways 507009822 and 1270798860 are named `Sortie Stands`; review them as pit-exit candidates.

Required research:

1. Identify the courses referred to as 3.0 km and 3.7 km in the earlier exploration.
2. Find independent route-identification evidence for those names.
3. Select exact OSM branches for each course.
4. Show that the two completed recipes use different physical sections.
5. Verify direction for both.
6. Determine whether they share a timing location. Copying one gate between files is allowed only if evidence confirms that association.

Do not rename an OSM closed way to `3.7 km` solely because it looks similar to a proprietary prototype. Do not stretch a polyline until its measured length matches a name.

If the currently mapped alternatives cannot support the requested historical labels, document the supported configurations and the missing evidence. Resolve naming with the maintainer instead of inventing correspondence.

## 6. Nürburgring

Purpose: demonstrate a large venue, separate GP and Nordschleife routes, and a separate-gate timing variant.

Useful OSM leads:

- [Node 3099078401](https://www.openstreetmap.org/node/3099078401), named `Nürburgring Start-Finish`, tagged `raceway=start-finish`, version 2 in the snapshot.
- [Way 26543901](https://www.openstreetmap.org/way/26543901), named `Anbindung zur Nordschleife`.
- [Way 27852583](https://www.openstreetmap.org/way/27852583), named `Anbindung zum GP Kurs`.
- [Way 27852990](https://www.openstreetmap.org/way/27852990), a Sprint-course lead.
- [Way 30815119](https://www.openstreetmap.org/way/30815119), a pit lane with layer information.
- [Way 31009257](https://www.openstreetmap.org/way/31009257), named `Boxengasse an T13`.
- [Way 31010602](https://www.openstreetmap.org/way/31010602), a 24-hour connection whose snapshot note says the connection was estimated. This belongs to later research.

The start/finish node is a candidate location, not evidence that every Nürburgring layout uses it. Its association with the selected GP course and timing convention must be checked. The full Nordschleife and BTG gates need their own evidence.

Required research:

1. Assemble GP and Nordschleife as separate reviewed routes.
2. Confirm which GP configuration is intended, including relevant chicane choices.
3. Resolve crossings through source node connectivity and layer context.
4. Exclude pit lanes and tourist access roads from the selected course.
5. Establish the full-lap Nordschleife timing convention and name it clearly.
6. Establish independent Bridge to Gantry start and finish positions.
7. Trim the BTG trace to those gate intersections in travel order.

Do not treat Nordschleife full, a record-lap convention, and BTG as interchangeable. Do not derive a gate from an approximate stated lap length.

## 7. Existing prototype boundary

Earlier local HTML explorers are useful for visual expectations: amber route, selectable layouts, map fitting, and visible gates. Their embedded geometry and gate coordinates were derived from reference.

Reuse product observations only. Build new public data from the source process in document 03. The previous prototype files are not public source inputs and must not enter this repository's data or build.

## 8. Pilot report

During implementation, maintain a short status table in the repository README or a linked pilot report. For each of the six required entries, report:

- Geometry: blocked, draft, or reviewed.
- Timing: missing, partial, estimated, or verified.
- Source-rights review: complete or blocked, with the reason.
- Next concrete evidence needed.

`Blocked` is a research status, not a GeoJSON geometry-status value. A blocked layout can remain absent from public data until a valid trace exists. Include it in the report so absence is not mistaken for completion.

The full pilot is complete only when all six required entries pass `--pilot-ready`. If evidence remains unavailable, deliver the working software and available reusable data, with a precise list of unresolved items.
