# Adding a venue or layout

1. Check the catalogue for duplicates. Choose a stable country and venue ID, then add the venue and bounded acquisition box to `scripts/venues.ts`.
2. Run `npm run import:osm -- --track <id>`. Existing valid snapshots are reused. Keep geometry, way versions, node IDs, attribution and the import hash; contributor identities are stripped.
3. Identify layouts and travel direction from independent evidence. Exclude pit, karting, service and area ways. Missing direction or layout evidence must remain explicit.
4. Write metadata in `data/<country>/<venue>/track.json` and one recipe in `sources/<id>/layouts/<layout>.json`. Recipes pin ordered, inclusive way slices. Joins require shared source node IDs; never close gaps by proximity.
5. Add a source review with public source links, exact recipe paths, direction, excluded branches, lengths, review date and outstanding questions. Reference-only sources support identification; their coordinates cannot enter the database.
6. Add independently reusable timing evidence or leave public gates missing. The supplied archive provides layout names, scalar course distances and private timing GPS. Never read its track boundaries or publish its GPS records as reusable data.
7. Run `npm run generate:data`, `npm run validate:data`, `npm run lint`, `npm test`, `npm run build`, and browser checks. Inspect each changed route and gate on the map. Keep geometry draft until its intended layout is confirmed.
8. Submit metadata, sanitized snapshots, recipes, review notes and generated data together. Catalogue entries are generated, never maintained separately.

An explicit `--refresh` import writes to ignored `sources-staging/<id>/`. Compare the new snapshot and topology with the saved sources, update and inspect affected recipes, then promote the staged snapshot, query and import manifest together. Update recipe hashes and source retrieval dates before regeneration. Keep the prior files until validation succeeds. Refreshes never automatically replace reviewed sources.

Code is MIT; OSM-derived database content is ODbL 1.0 with OpenStreetMap attribution. The build copies only `data/` and application assets. Private overlays, raw archives and temporary review files stay outside the public output.

## European inventory

Use `npm run discover:europe -- --country GB` to acquire one country's extract, or omit the country for a resumable serial run. `npm run expand:europe` works offline from pinned extracts. Its new course selections stay draft. The name patterns in `sources/europe/road-circuits.json` are classification hints only; add independent venue evidence and inspect the route before marking it reviewed. Pending groups and named facilities remain in `data/europe-coverage.json`, including countries with no published course. See [the coverage report](Docs/07-european-coverage.md) for discovery limits and remaining work.

## Worldwide inventory

Run `npm run discover:world` for the remaining ISO countries and territories, including full Russia, or add `-- --country US` for one additional country. Valid pinned extracts are reused. Country-area markers partition each batch; an absent marker records an unavailable acquisition area, not a country with no circuits. Never run multiple discovery processes concurrently.

Run `npm run expand:world` and `npm run generate:data` offline. European recipes remain available and the worldwide inventory combines their source records with the new extracts. Explicit multilingual karting and pit-lane names are excluded. World candidates can be as short as 500 m to retain small car circuits and paved ovals. Unknown identities, complex branches, course associations and unmapped geometry remain pending. Repeated venue names are allowed at distinct locations.

`npm run validate:world` checks country snapshot hashes and catalogue references. Reference websites support identity only; validators reject their use as coordinate sources. A source-cycle selection and a nearby private start/finish point cannot establish a reviewed named layout. See [worldwide coverage](Docs/08-worldwide-coverage.md).

## Completing the layout catalogue

The layout catalogue includes all supplied categories. The older country-discovery stage excludes karting and motocross when acquiring general road-circuit candidates; that filter does not remove expected catalogue entries.

Use the registration and recovery commands in the README for the complete catalogue. New courses must use independent source-node coordinates. Keep ambiguous layouts registered with `file: null` and a reason. A route selected by timing position and declared length is a draft hypothesis, not reviewed evidence of a named configuration.

Alternate OSM snapshots must be registered with their SHA-256 and source ID in the venue import manifest. Do not replace a source snapshot without preserving the versions required by existing recipes.

## Compact runtime data

Public layout GeoJSON stores source traces and timing, with optional compact terrain and road recipes. Do not save generated inner, outer or ideal coordinates. Configured widths and their former-boundary measurement provenance live in track.json. Uncertain layouts have an explicit unavailable reason; do not assign them an automatic width.

`npm run build` validates source recipes, reproducible generation, catalogue coverage, elevation and the compact-data/network contract. The saved-boundary authoring validators remain available for historical authoring work; they require their corresponding saved-geometry dataset, not the compact public format.

`npm test` runs current compact-runtime tests, then runs the retained authoring tests with current code against the pinned pre-migration data/source commit listed in tests/legacy-authoring-tests.json. These temporary fixtures are extracted from Git history, never shipped in the database. Fetch full Git history before running the complete test suite. Historical authoring tests establish compatibility with that format, not the physical accuracy of current estimated boundaries.

The one-way `scripts/migrate-width-corridors.ts` measures existing saved edges without fetching imagery. It archives originals under .local, remaps bridge profiles onto source-trace stations (including cyclic seam crossings), then removes derived coordinates. `scripts/sync-width-networks.ts` synchronizes component metadata with current child layouts; `--check` verifies without writing. Normal canonical source regeneration preserves compact metadata and never reintroduces saved edges.
