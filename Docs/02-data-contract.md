# Data contract, version 1

## 1. Storage tree

Implement this structure. Country and venue folders use lowercase ASCII slugs. Display names retain their normal spelling.

```text
data/
  index.json                         # Generated; committed
  austria/
    salzburgring/
      track.json                     # Maintained metadata
      layouts/
        grand-prix.geojson           # Generated from a reviewed recipe
  france/
    anneau-du-rhin/
      track.json
      layouts/...
  germany/
    nurburgring/
      track.json
      layouts/...
sources/
  at-salzburgring/
    osm.json                         # Sanitized, pinned OSM snapshot
    query.overpass
    import.json                      # Snapshot identity and hash
    layouts/
      grand-prix.json                # Route and gate recipe
    review.md                        # Evidence and unresolved questions
schemas/                             # Runtime/build-time schemas
src/                                 # Viewer and shared types
scripts/                             # Maintainer tools
tests/fixtures/                      # Synthetic data only
Docs/                                # This specification
```

The initial proposal uses `grand-prix` for Salzburgring as a stable identifier. Verify the display name separately. A folder name is not evidence of an official designation.

All public files use UTF-8 JSON. Use two-space indentation and a final newline. Write deterministic key and array ordering. Coordinate numbers are ordinary finite JSON numbers. Timestamps use UTC ISO 8601. Dates use `YYYY-MM-DD`.

Longitude must be between -180 and 180. Latitude must be between -90 and 90. Preserve original OSM coordinate precision. Round generated gate and intersection coordinates to at most seven decimal places, then calculate final length and bounds from those serialized coordinates. Decimal places are not a statement of positional accuracy.

Generated files are committed so a consumer can fetch data without running the importer. Generated output must be reproducible from the committed public source material. Public downloads do not depend on a contributor's home directory.

## 2. IDs and paths

- Venue ID: lower-case ISO alpha-2 country code, hyphen, venue slug. Example: `fr-anneau-du-rhin`.
- Layout ID: unique inside a venue. Pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Source ID: unique inside a venue; use the same slug pattern.
- A venue ID remains stable after a display-name change.
- A layout ID remains stable after spelling corrections or improved coordinates.
- A materially different course gets a different layout ID.
- File paths use `/`, remain relative, and contain no `..`, leading slash, URL scheme, or backslash.
- `track.json` layout paths are relative to its venue folder.
- Catalogue paths are relative to the `data/` root.

Do not infer identity from length alone. Two routes can have similar lengths. Two timing variants can share most of their route.

## 3. `track.json`

All fields are required unless the table marks them optional. Reject unknown fields in schema version 1 to catch misspellings. Extend the contract explicitly when needed.

| Field | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | integer | Exactly `1` |
| `id` | string | Stable venue ID |
| `name` | string | Nonempty display name |
| `aliases` | string array | Search names; may be empty |
| `country` | object | `code`: upper-case ISO alpha-2; `name`: English name; `slug`: folder name |
| `locality` | string | Optional; independently sourced |
| `location` | number pair or null | Independently sourced `[longitude, latitude]`; null when no public location is established |
| `sourceIds` | string array | Sources for venue identity and location; may be empty for entries without geometry |
| `defaultLayoutId` | string | References one of this venue's layouts |
| `layouts` | object array | Nonempty; each entry defined below |
| `sources` | object array | Source records defined below |

Each layout entry contains `id`, `name`, and `file`. It MAY contain `description`. Use `layouts/<id>.geojson` as its file path. Array order is the intended selector order. Do not sort it at runtime.

Each source record contains:

| Field | Rule |
| --- | --- |
| `id` | Unique source ID |
| `type` | `osm`, `survey`, `permission`, or `reference` |
| `title` | Short source name |
| `url` | Public HTTP(S) source or permission/evidence URL |
| `license` | Reuse license identifier, or `reference-only` |
| `retrievedAt` | UTC timestamp when the source was obtained |
| `evidenceNote` | What this source supports and any limits |

`reference-only` can support factual naming or route-identification notes. It MUST NOT be the source of published coordinates. A web page being publicly visible does not give permission to trace its map. Store permission terms or survey evidence in `sources/` and link them from the review. Record rights for contributed coordinates, not only a source title.

Synthetic example; this is not a real venue:

```json
{
  "schemaVersion": 1,
  "id": "fr-example-circuit",
  "name": "Example Circuit (test fixture)",
  "aliases": [],
  "country": { "code": "FR", "name": "France", "slug": "france" },
  "location": [7.0, 48.0],
  "sourceIds": ["synthetic-fixture"],
  "defaultLayoutId": "full",
  "layouts": [
    { "id": "full", "name": "Full circuit", "file": "layouts/full.geojson" }
  ],
  "sources": [
    {
      "id": "synthetic-fixture",
      "type": "survey",
      "title": "Synthetic test coordinates; not a real survey",
      "url": "https://example.org/test-fixture",
      "license": "CC0-1.0",
      "retrievedAt": "2026-09-30T00:00:00Z",
      "evidenceNote": "Format example only. Never include in the public catalogue."
    }
  ]
}
```

## 4. Layout GeoJSON

Each file is a GeoJSON `FeatureCollection`. Follow longitude-first WGS84 decimal-degree positions from [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946). Use exactly two coordinate dimensions. Do not include a legacy `crs` member.

Top-level required members are `type`, `bbox`, `metadata`, and `features`. `metadata` is a GeoJSON foreign member used by this project.

`bbox` is `[west, south, east, north]`, calculated from all coordinates, including gates. The pilot does not cross the antimeridian. Reject a future antimeridian case with a clear unsupported-case message until that behavior is implemented.

| Metadata field | Type and rule |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `trackId` | Matches parent venue |
| `layoutId` | Matches parent layout entry |
| `license` | `ODbL-1.0` for this initial public database |
| `attribution` | Includes `© OpenStreetMap contributors` when OSM-derived |
| `closed` | Boolean; whether the displayed trace is a closed circuit |
| `geometryStatus` | `draft` or `reviewed` |
| `timingStatus` | `missing`, `partial`, `estimated`, or `verified`; derived as below |
| `timingMode` | `shared` or `separate` |
| `lengthM` | Positive number, generated from the trace, rounded to 0.1 m |
| `reviewedAt` | Review date or `null` |
| `notes` | String array; may be empty |

`lengthM` is the geographic polyline length. It is not an official homologated distance. A nominal distance in a layout name need not equal this number.

Use a haversine sum with mean Earth radius 6,371,008.8 m. This is sufficient for an approximate display length. Store the result to 0.1 m; show it to 0.01 km in the viewer. This precision does not imply measurement accuracy.

Feature order is trace, shared gate, start gate, finish gate, with absent roles omitted. Every feature has a unique `id`, a `properties` object, and a `LineString` geometry. No MultiLineString, Polygon, or Point features in v1 layout files.

## 5. Trace feature

The trace feature has ID `trace` and these exact properties:

```json
{
  "role": "trace",
  "sourceIds": ["osm-2026-09-30"]
}
```

Rules:

- Exactly one trace feature per layout.
- Coordinates follow the intended travel direction, confirmed during review.
- Open traces have at least two distinct positions.
- Closed traces have at least three distinct positions plus an exact repeat of the first position at the end.
- No adjacent duplicate positions. The closing repeat is allowed.
- Connections come from the route recipe, not a visual nearest-neighbor guess.
- Preserve the mapped shape. Do not average reference edges or GPS racing paths into it.
- A crossing in the map does not necessarily mean an intersection. Bridges can cross in 2D.
- The first position of a closed trace is an implementation choice. It has no timing meaning.

## 6. Gate features

A shared start/finish line uses one feature with ID and role `start_finish`. Separate timing uses IDs and roles `start` and `finish`. Gates use exactly two distinct positions.

Required gate properties:

| Field | Rule |
| --- | --- |
| `role` | `start_finish`, `start`, or `finish` |
| `sourceIds` | Nonempty list of reusable coordinate sources |
| `positionStatus` | `verified` or `estimated` |
| `endpointMethod` | `source-endpoints` or `perpendicular-display` |
| `positionNote` | Evidence for this timing position and its layout association |

Verified means the source identifies the intended timing location for this layout, and review found the mapped position consistent. It is not a claim of survey-grade accuracy.

`perpendicular-display` means the endpoints were generated around a sourced center point. The recipe records the chosen display width and tangent segment. Gate endpoints must not be described as independently measured in this case.

Timing combinations:

| Mode | Allowed gates | Derived status |
| --- | --- | --- |
| `shared` | No gate | `missing` |
| `shared` | One `start_finish` | `verified` if position verified; otherwise `estimated` |
| `separate` | No gates | `missing` |
| `separate` | Only start or only finish | `partial` |
| `separate` | Start and finish | `verified` if both positions verified; otherwise `estimated` |

A shared gate cannot coexist with separate gates. Status must agree with the actual features. Missing gates are represented by absence, not null geometry.

A verified point-to-point timing layout MUST have both gates. Its trace begins at its start-gate intersection and ends at its finish-gate intersection. Split source segments at those intersections. Record the derived intersections in the recipe. A draft of such a route can remain incomplete, but it cannot pass pilot acceptance.

For a closed trace with separate gates, both gates lie on the loop. Do not cut the loop just because the gates differ. The trace still represents the displayed physical layout.

## 7. Structural illustration

This illustration contains a synthetic closed trace and no timing line. It is not pilot data. Its length uses the calculation defined above.

```json
{
  "type": "FeatureCollection",
  "bbox": [7.0, 48.0, 7.001, 48.001],
  "metadata": {
    "schemaVersion": 1,
    "trackId": "fr-example-circuit",
    "layoutId": "full",
    "license": "ODbL-1.0",
    "attribution": "Synthetic test fixture",
    "closed": true,
    "geometryStatus": "draft",
    "timingStatus": "missing",
    "timingMode": "shared",
    "lengthM": 371.2,
    "reviewedAt": null,
    "notes": ["Synthetic format illustration; not a real circuit."]
  },
  "features": [
    {
      "type": "Feature",
      "id": "trace",
      "properties": { "role": "trace", "sourceIds": ["synthetic-fixture"] },
      "geometry": {
        "type": "LineString",
        "coordinates": [[7.0, 48.0], [7.001, 48.0], [7.001, 48.001], [7.0, 48.001], [7.0, 48.0]]
      }
    }
  ]
}
```

## 8. Generated catalogue

`data/index.json` has `schemaVersion: 1` and `tracks`, sorted by venue ID for deterministic output. Each entry contains:

- `id`, `name`, `aliases`, `country`, optional `locality`, and `location`, copied from metadata.
- `file`, the relative path to the venue's `track.json`.
- `layoutCount`, calculated from the complete layout list.
- `traceCount`, counting layouts with an actual GeoJSON file.

The viewer applies display sorting itself. The index contains no traces and no duplicated layout metadata. Do not add a build-time timestamp that changes on every run.

## 9. Validation

Implement shared schemas with a small established validation library. Use them in build tools and on fetched data. Add semantic checks after shape validation.

The browser checks public-file shape, identity, source references, and geometry consistency. Snapshot hashes, recipe connectivity, source-rights evidence, and review records are maintainer/build checks. The browser does not fetch the `sources/` tree to run them.

Hard errors, exit code nonzero:

- Malformed JSON, unsupported version, missing or unknown fields.
- Duplicate venue, layout, feature, or source IDs.
- Invalid paths, missing files, broken default-layout or source references.
- Invalid coordinates, invalid geometry type, duplicate adjacent positions, invalid closure.
- Wrong track/layout identity inside a layout file.
- Incorrect bbox, length differing from recomputation by more than 0.2 m, or contradictory timing status.
- `reviewed` geometry with no review date or evidence record.
- Gate roles inconsistent with timing mode.
- A gate that does not intersect its intended trace segment; use a 0.5 m numerical tolerance in a local metric projection.
- A verified open timing layout whose endpoints are more than 0.5 m from its gate intersections.
- A coordinate source marked `reference-only`, a missing reuse basis, or a source recipe hash mismatch.
- A recipe segment absent from its pinned snapshot, or route segments that cannot connect.

Review findings, reported separately:

- Missing or estimated timing positions.
- Draft geometry.
- Unexplained long segments, large length changes, or self-crossings.
- Layout names whose nominal distances differ from computed length.
- An OSM source note that identifies uncertain geometry.

A warning is not proof of an error. Bridges and alternative measurement conventions need human interpretation. Do not impose a rule that rejects layouts based on a fixed percentage of shared geometry.

The normal validator allows valid draft data with reusable sources. A `--pilot-ready` mode fails if any required target in document 04 is absent, has draft geometry, or lacks verified timing positions. Report the exact venue, layout, field, and reason for each failure.

## 10. Data evolution

Keep v1 additive where possible. Add new venues and layouts without code changes. A format change requires a specification update and schema-version decision. Historical track configurations and a general migration framework are outside this pilot.

## Registered entries without geometry

A layout can have `file: null` with a `missingGeometryReason`. It remains selectable, but the viewer clears the previous trace and provides no GeoJSON download. `referenceId` identifies its expected catalogue entry. Layout IDs and reference IDs must be unique within each venue.

A venue containing only unavailable layouts can have `location: null` and empty source lists. Any venue with a trace requires an independent location and source records. Missing geometry does not satisfy route coverage.

Recipes may select a pinned alternate snapshot using `snapshotFile`. The snapshot filename, SHA-256 and source ID must also appear in the venue's import manifest. Each recipe uses the exact source versions in its selected snapshot.
