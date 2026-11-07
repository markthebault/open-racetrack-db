# 3D models for the bordered catalogue

The first catalogue-wide batch prepared **882 3D layouts across 534 circuits with existing inner and outer borders**. Additional image-derived estimates and their coverage gaps are tracked in [15-imagery-border-inference.md](15-imagery-border-inference.md). There are 841 playable closed laps and 41 surface-only views: 24 branch networks, one open route and 16 closed routes whose trace/border alignment fails the lap audit. Every layout has its own existing GeoJSON, with no mesh, image or trajectory file added.

Choose **3D** to see the saved road boundaries as a road surface with illustrative curbs. **Play lap** opens the car player for eligible closed routes. Surface-only layouts instead offer **Explore 3D** and explain why playback is unavailable. The main atlas also retains **Map**, **Satellite** and **3D**. Satellite requires the configured MapTiler browser key.

The original 20 popular examples remain listed below. Choose the named layout, then **Play lap**, or append `&lap=1` to its track/layout URL. Each layout stores its complete track-specific model in `metadata.model3d` of the existing GeoJSON.

These are approximate previews. Existing border coordinates and source metadata are preserved. New elevation profiles come from the existing per-venue terrain raster (sample spacing varies by venue), rather than surveyed road heights or published venue anchors. Banking is unknown and assumed flat. **Curbs and bend labels are illustrations generated from curvature; their actual locations, dimensions and colours have not been verified against imagery.** This distinction is stored in `model3d.quality` and shown in the player, including the main view overlay.

| Track | Layout | Elevation anchors | Illustrative curb sections | Data |
| --- | --- | ---: | ---: | --- |
| Autodromo Nazionale Monza | `grand-prix` | 49 | 11 | [GeoJSON](../data/italy/monza/layouts/grand-prix.geojson) |
| Mugello Circuit | `grand-prix` | 78 | 15 | [GeoJSON](../data/italy/mugello/layouts/grand-prix.geojson) |
| Nürburgring | `grand-prix` | 44 | 22 | [GeoJSON](../data/germany/nurburgring/layouts/grand-prix.geojson) |
| Hockenheimring | `grand-prix` | 42 | 13 | [GeoJSON](../data/germany/hockenheimring/layouts/grand-prix.geojson) |
| Silverstone Circuit | `silverstone-gp-wing-sf` | 31 | 18 | [GeoJSON](../data/united-kingdom/silverstone-circuit-3571477/layouts/silverstone-gp-wing-sf.geojson) |
| Brands Hatch Circuit | `brands-hatch-gp` | 48 | 12 | [GeoJSON](../data/united-kingdom/brands-hatch-circuit-4906929/layouts/brands-hatch-gp.geojson) |
| Donington Park | `donington-gp` | 35 | 14 | [GeoJSON](../data/united-kingdom/donington-park-27131003/layouts/donington-gp.geojson) |
| Oulton Park Circuit | `oulton-park-international` | 36 | 17 | [GeoJSON](../data/united-kingdom/oulton-park-circuit-21831735/layouts/oulton-park-international.geojson) |
| Circuit de Nevers Magny-Cours | `grand-prix` | 30 | 16 | [GeoJSON](../data/france/magny-cours/layouts/grand-prix.geojson) |
| Circuit Paul Ricard | `main` | 48 | 20 | [GeoJSON](../data/france/paul-ricard/layouts/main.geojson) |
| Circuit Zandvoort | `grand-prix` | 25 | 14 | [GeoJSON](../data/netherlands/zandvoort/layouts/grand-prix.geojson) |
| Hungaroring | `main` | 46 | 15 | [GeoJSON](../data/hungary/hungaroring-231328650/layouts/main.geojson) |
| Algarve International Circuit | `main` | 61 | 17 | [GeoJSON](../data/portugal/algarve-international-circuit-39218663/layouts/main.geojson) |
| Autódromo do Estoril | `estoril` | 57 | 12 | [GeoJSON](../data/portugal/autodromo-do-estoril-38160756/layouts/estoril.geojson) |
| Circuit Of The Americas | `main` | 55 | 21 | [GeoJSON](../data/united-states/cota-circuit/layouts/main.geojson) |
| WeatherTech Raceway Laguna Seca | `main` | 39 | 14 | [GeoJSON](../data/united-states/weathertech-raceway-laguna-seca-10464852/layouts/main.geojson) |
| Road America | `road-america` | 78 | 12 | [GeoJSON](../data/united-states/road-america-110527567/layouts/road-america.geojson) |
| Watkins Glen International | `watkins-glen` | 52 | 14 | [GeoJSON](../data/united-states/watkins-glen-international-20163576/layouts/watkins-glen.geojson) |
| Sebring International Raceway | `sebring` | 19 | 20 | [GeoJSON](../data/united-states/sebring-international-raceway-426154257/layouts/sebring.geojson) |
| Interlagos | `interlagos` | 65 | 14 | [GeoJSON](../data/brazil/br-interlagos-6c69e04f/layouts/interlagos.geojson) |

## Repeatable preparation

```sh
# Prepare every layout with both borders; unchanged models are skipped.
npm run model:prepare -- --bordered

# Prepare just the original popular batch.
npm run model:prepare -- --popular

# Prepare another already-mapped circuit/layout.
npm run model:prepare -- --track it-monza --layout grand-prix

# Check all embedded generated models without modifying data.
npm run validate:models

# Rebuild generated parameters after source geometry/terrain changes.
npm run model:prepare -- --track it-monza --layout grand-prix --refresh
```

The command discovers all bordered layouts directly from the catalogue; no per-track preparation files are needed. Lap playback requires a closed, single-route trace, two usable supplemental borders and terrain coverage. Without a GPS start gate, the first trace coordinate sets the simulation origin and is labelled Trace start. Open routes, branch networks and layouts with more than 8% unmatched cross-sections receive an explicit `kind: surface` model and a reason. Their source border rings form the road footprint without inventing a closed driving order or assumed constant width.

For playable laps, the pipeline projects the existing geometry into local metres; pairs crossings from the two source borders; samples terrain at approximately 40 m course intervals; compresses it to monotone-cubic anchors within 0.5 m of those **samples**; generates explicitly illustrative curb intervals; validates and simulates the model; and updates the same GeoJSON. The tolerance is not a survey-accuracy claim. A few invalid border cross-sections may interpolate between valid source sections; the command rejects more than 8% missing sections.

An input SHA-256 covers the preparation version, source features, timing, mapped length and terrain. Unchanged inputs skip reconstruction. `--check` detects missing or stale generated data. Source/terrain changes require preparation again; the normal build checks this. A hand-authored or imagery-reviewed model, including Spa, is never overwritten by this tool. To promote generated data after actual review, update its quality/source notes and remove its `preparation` tag.

An individually checked display reference can set `model3d.preparation.preserveImageryReference: true`. Its existing `model3d.imagery` reference then survives preparation and is included in the input hash. This allows replacing an unavailable imagery service without changing road geometry or storing image bytes. The reference and attribution remain in the same GeoJSON; it does not identify imagery-derived borders or verify curb positions.

## Storage and imagery

The complete 882-layout model set is approximately 6.0 MB before compression, or 2.3 MB with each block gzip compressed, including embedded terrain grids. Each layout stores one compact parameter block in its existing GeoJSON. No mesh, baked trajectory, imagery bytes or video is stored in track data. Obsolete terrain sidecars are removed only when no other mapped layout in that venue still needs one; remaining shared grids serve the other layouts. Playback for prepared layouts needs only their one GeoJSON plus shared application code and remote imagery.

Imagery is a live Esri World Imagery display resource with georeferencing, attribution and a provider-terms link in each model. Preparation does not download, trace or harvest that service to create curb data. Its availability and imagery date can vary. The local example is not a new redistribution/commercial licence grant. See [service metadata](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) and [provider terms](https://www.esri.com/en-us/legal/terms/web-site-service). Spa retains its SPW source and published elevation anchors.

## Measured optimizations

- Venue metadata, layouts and terrain grids are cached during batch processing. Obsolete terrain files are removed only after every layout in the venue is self-contained. The complete first batch took 43.83 s on this machine, including discovery, schema checks, reconstruction, simulation and file writes; an unchanged full pass took 2.36 s. Source research, imagery downloads and browser checks are excluded.
- Border segments are spatially indexed once. A cross-section checks nearby segments instead of scanning both entire paths. Across 32621 queries on these 20 layouts, indexed intersections took 43.7 ms versus 172.9 ms for full scans (4.0× faster), with exactly the same selected offsets. This isolates the intersection stage, not full rendering.
- A full local conversion of the existing 20 inputs took 1.96 s; an unchanged pass took 0.069 s. These timings exclude process startup, source research, imagery loading, tests and visual review. They are one-machine measurements, not service guarantees.
- Elevation samples are compressed before storage, and source meshes are regenerated only when a view is opened. The generic player, camera, physics and validation are shared across all circuits.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Browser coverage traverses all 882 bordered layouts in the actual 3D UI, checking their individual source-road meshes, curb counts, layout labels and playback availability. Additional cases cover every popular example, generic track/layout labels, source-quality labels, playback/seek/camera controls, downloads with embedded data, no extra terrain requests, layout switching, phone scrolling and recording. Live imagery and representative rendered views were checked separately. Missing raster coverage is left as holes instead of being filled with a synthetic fixed height.

## Model modes

A lap model retains the Spa-compatible fields documented in [13-spa-lap.md](13-spa-lap.md). A surface-only model has `kind: surface` and `reason: route-not-closed` or `border-alignment`. It stores the same terrain grid, georeferenced imagery reference, source quality and curb style, with curb intervals addressed by border role and path index. It stores no fake lap profile or driving order. The orbit camera fits the actual bounds, including small ovals and the 60 km TT Course; large-course overviews also highlight the driving path. The browser triangulates each saved pair of border rings and rebuilds curb strips when that layout is selected.

The 16 alignment exceptions are Buenos Aires H, Calder Park main, Oran Park, ICAR Mirabel, Strawberry Creek, Dunsfold Top Gear, ProDrive, Fuji Short, Nihonkai Maze, Gotland Ring 4.1 / 6.0 / 7.3, Sviestad, Apex II / III and New Jersey Thunderbolt. The original coordinates remain unchanged for later review. Other unbordered layouts keep their existing trace viewer.
