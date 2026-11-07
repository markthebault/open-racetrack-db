# Autódromo Internacional de Guaporé Nelson Luiz Barro

Geometry: **draft**. Public timing: **missing**. Inspector: Codex, 2026-09-30.

Parent country snapshot: `world/br/osm.json`, SHA-256 `61acaa81574ee7e139cfbfbfd7e9184f31a9b9af2cbda917ddcf23ce23815444`. Venue subset SHA-256: `a675df574a5bac25f84e9e54b33d578197283cd79e815fb8aabbf2e8b9f296aa`.

## Previous connected course candidate (superseded)

Recipe: `layouts/main.json`. Approximate trace length: 3311.7 m. Candidate count: 10. Connected OSM course candidate. The selected loop is the longest simple source-node cycle after explicit exclusions; its association with a named circuit configuration requires review. Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read. Some source ways lack one-way direction tags. Travel direction is provisional.

Identity: [OSM way 103598924](https://www.openstreetmap.org/way/103598924). Source geometry: [way 103598914](https://www.openstreetmap.org/way/103598914), [way 103598919](https://www.openstreetmap.org/way/103598919), [way 103598920](https://www.openstreetmap.org/way/103598920), [way 446405589](https://www.openstreetmap.org/way/446405589).

Pit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.

Remaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.

## Main source correction, 2026-11-07

The generic longest-cycle fallback follows the parallel pit lane and an extra return spur instead of the direct racing straight. The independently authored historical map distinguishes the straight from pit lane; native imagery confirms the current physical paving. Native licensed imagery confirms the physical road arrangement. The historical recipe, source hashes and identity references remain in `sources/research/guapore-route-correction.json`. No diagram coordinates, widths or distances are extracted or fitted. The corrected fallback follows the exact already registered named source, with draft direction retained. Main timing stays missing; sibling timing GPS is not copied.

The original supplemental pair is not reused because native overlay review exposes positional errors. New main limits require image observations with complete reconstruction provenance and existing coverage, width and driving-order guards. All other layouts, prior borders, timing and original terrain are preserved. Curbs remain illustrative, raster elevations approximate and unknown banking zero.

### Border coverage remains unavailable

Native imagery review rejects direct reuse of the original supplemental limits and the automatic candidates. No candidate borders or model are promoted for main. Source correction is independently supported and does not establish boundary accuracy. V4 limits follow pit aprons, internal asphalt patches and grass in several sections. V2 is rejected by the search-limit guard. The approximately 0.26 m higher-zoom tiles show the same underlying blur and do not resolve the uncertainty. No candidate edge coordinates or 3D model are promoted. This source correction does not close the coverage gap.
