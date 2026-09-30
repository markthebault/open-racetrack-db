# Adding a venue or layout

1. Check the catalogue for duplicates. Choose a stable country and venue ID, then add the venue and bounded acquisition box to `scripts/venues.ts`.
2. Run `npm run import:osm -- --track <id>`. Existing valid snapshots are reused. Keep geometry, way versions, node IDs, attribution and the import hash; contributor identities are stripped.
3. Identify layouts and travel direction from independent evidence. Exclude pit, karting, service and area ways. Missing direction or layout evidence must remain explicit.
4. Write metadata in `data/<country>/<venue>/track.json` and one recipe in `sources/<id>/layouts/<layout>.json`. Recipes pin ordered, inclusive way slices. Joins require shared source node IDs; never close gaps by proximity.
5. Add a source review with public source links, exact recipe paths, direction, excluded branches, lengths, review date and outstanding questions. Reference-only sources support identification; their coordinates cannot enter the database.
6. Add independently reusable timing evidence or leave public gates missing. Racelogic can supply private timing references and layout names only. Never read its track boundaries or publish its GPS records as reusable data.
7. Run `npm run generate:data`, `npm run validate:data`, `npm run lint`, `npm test`, `npm run build`, and browser checks. Inspect each changed route and gate on the map. Keep geometry draft until its intended layout is confirmed.
8. Submit metadata, sanitized snapshots, recipes, review notes and generated data together. Catalogue entries are generated, never maintained separately.

An explicit `--refresh` import writes to ignored `sources-staging/<id>/`. Compare the new snapshot and topology with the saved sources, update and inspect affected recipes, then promote the staged snapshot, query and import manifest together. Update recipe hashes and source retrieval dates before regeneration. Keep the prior files until validation succeeds. Refreshes never automatically replace reviewed sources.

Code is MIT; OSM-derived database content is ODbL 1.0 with OpenStreetMap attribution. The build copies only `data/` and application assets. Private overlays, raw archives and temporary review files stay outside the public output.

## European inventory

Use `npm run discover:europe -- --country GB` to acquire one country's extract, or omit the country for a resumable serial run. `npm run expand:europe` works offline from pinned extracts. Its new course selections stay draft. The name patterns in `sources/europe/road-circuits.json` are classification hints only; add independent venue evidence and inspect the route before marking it reviewed. Pending groups and named facilities remain in `data/europe-coverage.json`, including countries with no published course. See [the coverage report](Docs/07-european-coverage.md) for discovery limits and remaining work.
