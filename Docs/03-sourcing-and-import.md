# Sources, imports, and review

## 1. Public data policy

Every published coordinate MUST have a documented reuse basis. For the initial database, prefer OSM geometry and timing nodes. Accept independent surveys or explicit permissions when their terms permit the planned database distribution.

Use these source categories:

| Source | Permitted role |
| --- | --- |
| OSM ways and nodes | Route coordinates, venue location, and timing positions when mapped |
| Independent contributed survey | Coordinates with documented contributor rights and compatible permission |
| Track operator data with explicit permission | Coordinates within the permission's scope |
| Official circuit website or public event documentation | Factual layout identification; map tracing only with suitable rights |
| reference local database | Optional private discrepancy check; no public coordinate import without permission |
| TUM racetrack database | Background research only for this pilot |

OSM publishes its data under ODbL. The planned database license is ODbL 1.0. Keep original application code under MIT. The code license does not replace source-data obligations. See [OSM copyright](https://www.openstreetmap.org/copyright) and the [ODbL license](https://opendatacommons.org/licenses/odbl/1-0/).

During implementation, add a clear license map, a full code-license file, a data-license reference or copy, and attribution instructions. Accept only sources that can be distributed within this policy. A source-rights question blocks that source, not unrelated viewer development.

The public review record MUST identify the evidence used for a rights decision. Validation can check that evidence exists; it cannot prove a contributor owns rights.

## 2. reference boundary

The local database is at `/Users/mth-solvd/persospace/reference-tracks-db`. This is a local research path, not an application dependency. Public availability of a download has not established redistribution rights for this project.

The earlier suggestion to copy only start/finish coordinates is not the default implementation policy. A small coordinate subset still requires a reuse basis. Use independently sourced timing positions unless the maintainer obtains permission that covers extraction and public redistribution.

For an optional local comparison:

1. Complete the OSM-derived route first and preserve its source recipe.
2. Load the private reference only through an explicit local command or separate research tool.
3. Keep input, overlays, coordinates, screenshots, and comparison output outside tracked files and the static build.
4. Use disagreement to create a research question.
5. Resolve any correction through an independent reusable source before changing public geometry.

A visual match is not proof of permission or correctness. Do not snap, warp, average, or interpolate public geometry using reference geometry. Do not move a public gate to match a proprietary point.

Prior inspection suggests many `.cir` files contain both track edges. Their total polyline length can be about twice a lap. Do not use this length as an automatic reference length. File columns also vary. Building a general reference parser or comparison dashboard is outside v1.

A later coverage exercise can use the local catalogue to identify candidate venues. Re-establish their identity and layouts independently. Review permission before publishing a bulk extracted catalogue. Keep local coverage lists private until that review is complete.

## 3. OSM acquisition

OSM maps raceways as ways. It also permits area representations and timing nodes. See the [raceway tagging documentation](https://wiki.openstreetmap.org/wiki/Tag:highway%3Draceway). A collection of nearby ways is not automatically a named layout.

Implement a maintainer-only command that fetches one venue at a time. Use a configured Overpass endpoint, a bounded timeout, and a saved bounding box. Cache the result. Refresh only when explicitly requested.

Start with this query shape. Replace `S,W,N,E` with numeric bounds from the pilot document:

```text
[out:json][timeout:60];
(
  way["highway"="raceway"](S,W,N,E);
  node["raceway"~"^(start|finish|start-finish)$"](S,W,N,E);
);
out meta geom;
```

A result can include unrelated karting, pit, service, or training routes. Review candidates. A relevant connector might use another tag. Fetch that object explicitly when evidence identifies it, and record why it is included.

Handle HTTP errors, rate limits, and Overpass error remarks. An HTTP 200 response can still contain an error. Write a temporary file, validate it, and replace the snapshot only on success. A failed refresh leaves the last valid snapshot intact.

For rate limits or temporary service errors, honor `Retry-After` when supplied. Limit automatic retries to two after the initial attempt. Report failure clearly; do not switch to uncontrolled parallel requests.

The [Overpass documentation](https://wiki.openstreetmap.org/wiki/Overpass_API) describes extraction. It is an import source, not a website runtime dependency.

## 4. Pinned source snapshot

Commit a sanitized `osm.json` for each pilot venue. Retain only the fields needed to reproduce routes and inspect source context:

- Top-level source attribution and OSM base timestamp.
- Element type, ID, version, timestamp, tags, node IDs, and coordinates.
- Way geometry with the node order preserved.

Remove contributor usernames, user IDs, and unrelated metadata. Preserve all tags on selected candidate elements, including uncertainty notes. Do not claim the sanitized file is a complete raw API response.

`import.json` MUST contain:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `trackId` | Venue ID |
| `sourceId` | Source ID used in the venue metadata |
| `endpoint` | Overpass endpoint used |
| `bbox` | `[west, south, east, north]` |
| `fetchedAt` | Actual fetch time |
| `osmBaseTimestamp` | Timestamp reported by Overpass |
| `snapshotFile` | `osm.json` |
| `snapshotSha256` | SHA-256 of the exact committed snapshot bytes |
| `queryFile` | `query.overpass` |

Store a separate source record if non-OSM coordinates are used. Keep its original reusable evidence and conversion steps in the venue's `sources/` directory. Do not pretend a survey or permitted source came from OSM.

Normal generation uses only pinned local source material. It MUST work without network access. A refresh can change OSM way topology; do not silently repair a broken recipe against new data.

## 5. Route recipes

Use one JSON recipe per layout at `sources/<trackId>/layouts/<layoutId>.json`. It describes the exact ordered traversal. This is a small deterministic converter, not a general routing engine.

Required recipe fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `trackId`, `layoutId` | Public identities |
| `sourceId` | Pinned OSM snapshot source ID |
| `snapshotSha256` | Must equal the corresponding import hash |
| `closed` | Expected route closure |
| `timingMode` | `shared` or `separate` |
| `geometryStatus` | `draft` or `reviewed` |
| `reviewedAt` | Date or `null` |
| `notes` | Array of public explanatory notes |
| `segments` | Nonempty ordered array of source-way slices |
| `gates` | Array of gate recipes; can be empty |

Each segment contains `wayId`, `wayVersion`, `fromIndex`, and `toIndex`. Indices are zero-based positions in the way's pinned node array, inclusive. Travel follows increasing indices when `toIndex > fromIndex`, and decreasing indices otherwise. Equal indices are invalid. Indices must be within bounds.

Check traversal against explicit `oneway` tags. A conflict requires a documented source review before the geometry can be marked reviewed. Missing direction tags are not proof that both directions are valid.

For a closed OSM way, express traversal across the array boundary as two slices. The repeated closing node then connects the slices. Explicit indices also distinguish repeated node occurrences. Record human-readable source way links in `review.md`.

Assembly steps:

1. Resolve each way from the pinned snapshot and verify its version.
2. Extract the slice in the specified order.
3. Require the previous slice's last node ID to equal the next slice's first node ID.
4. Append the next slice without the shared first point.
5. For a closed route, require the final node ID to equal the initial node ID.
6. Preserve the closing coordinate exactly once.
7. Apply explicit point-to-point trimming, when required by the gate procedure.
8. Calculate length and bounds from the final published geometry.

Do not connect ways because their coordinates are nearby. Two roads at a bridge can overlap visually and remain disconnected. Keep `layer`, `bridge`, and `tunnel` tags available during review.

If a genuine route connection is absent from the data, mark the layout blocked or draft and seek a reusable correction. Do not add a straight segment to close a gap. Improving OSM is a separate contributor action with its own evidence requirements.

Exclude `area=yes` ways from traces. Exclude pit lanes, paddock loops, run-off areas, and service routes unless independent evidence shows that a section belongs to the intended layout. Names alone are not a reliable classification.

## 6. Timing recipes

Each gate recipe MUST contain:

- `role`, `sourceIds`, `positionStatus`, `endpointMethod`, and `positionNote`, as defined in document 02.
- `anchorSegmentIndex` and `anchorEdgeIndex`: identify an edge inside a selected recipe slice, in traversal order, before trimming.
- The source-specific input described below.

Both anchor indices are zero-based. Edge 0 connects the first and second points of the selected slice after applying its travel direction. Validate the anchor against that slice, not the source way's original order.

For `source-endpoints`, include `endpoints` as two WGS84 positions. The evidence must support those actual endpoints. Verify that they cross the chosen route edge.

For `perpendicular-display`, include `sourcePosition` as a WGS84 point and `displayWidthM` as a positive number. Also include `osmNodeId` and `osmNodeVersion` when the position comes from an OSM node. Other source types need equivalent evidence in the review record.

Use 25 m as the initial display width, unless the reviewer records a reason to change it. This is a drawing convention, not measured track width.

Generation method:

1. Convert the selected edge and source point into a local metric plane centered near the gate.
2. Project the source point onto the selected edge, clamped to the segment.
3. Record the displacement in the review output. If it exceeds 5 m, stop generation for review. The 5 m threshold is a workflow guard, not an accuracy claim.
4. Use the selected edge's travel direction as the tangent.
5. Place endpoints half the chosen width on each side, perpendicular to that tangent.
6. Convert the endpoints back to WGS84. Verify the intersection after serialization.

For this local calculation, an equirectangular plane with Earth radius 6,371,008.8 m is sufficient: `x = R * (lon-lon0) * cos(lat0)` and `y = R * (lat-lat0)`, with angles in radians. Use the inverse formulas to return to longitude and latitude. Keep full calculation precision until output serialization.

A projection within 5 m does not automatically verify a gate. The review must confirm the selected segment, intended timing convention, source point, and displacement. A named way such as `Start` is insufficient to select a precise line.

For an open timing variant, assemble the supporting route first. Use the selected gate intersections to trim it from start to finish in travel order. A recipe can use a closed supporting loop and emit an open trace. Interpret `closed` as the final output requirement. If travel crosses the supporting loop's array boundary, rotate the assembled sequence before trimming. Fail if the selected intersections cannot define one unambiguous forward traversal.

For a closed circuit, keep the full loop. Do not rotate it to a gate unless that makes the recipe easier to inspect. Rotation has no timing semantics.

If evidence is missing, leave the gate absent. A position estimate is publishable only when it comes from a reusable source and is explicitly labelled. Never call an inferred position verified because it looks plausible on a basemap.

## 7. Review record

Each venue's `review.md` MUST include a section for every required layout with:

1. Display name and independent evidence for that name or timing convention.
2. Source snapshot identity and recipe path.
3. Route traversal and direction evidence.
4. A note on each ambiguous junction or excluded alternative.
5. Measured length and any explained difference from a published nominal length.
6. Start/finish evidence, layout association, and generated endpoint method.
7. Source-rights basis for every non-OSM coordinate source.
8. Review date, reviewer identity or agent name, and remaining questions.
9. Explicit geometry and timing status.

A reviewer can be an implementation agent. The record must distinguish checked evidence from an assumption. Use screenshots from the OSM-derived local viewer when useful; include attribution. A screenshot is supporting evidence, not the editable source of geometry.

Source-only changes trigger a fresh geometry review. A metadata spelling correction does not require a complete geometry review. Changes to route selection, direction, timing source, or gate anchor do.

## 8. Publication boundary

The public build contains only files allowed by its explicit asset-copy list. Check the built file list before declaring completion.

It MUST exclude local filesystem paths embedded in data, reference files, prior prototype GeoJSON, private comparison outputs, unpublished permission material, and test fixtures. Public source records use public URLs.

Add `.local/` and temporary import staging to `.gitignore` during implementation. Keep actual private comparison material outside the repository where possible. An ignored file must still be excluded from the build by construction.

Do not place a private-data test fixture in Git to test that it is excluded. Use a harmless synthetic sentinel for that test.
