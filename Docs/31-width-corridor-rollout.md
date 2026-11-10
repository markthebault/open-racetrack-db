# Width-only database rollout

The three-venue width prototype now covers 1,182 layouts with usable boundary-derived width data: the original migration, excluding four known uncertain layouts. The other 191 mapped entries have no existing boundary data and receive no invented width.

Each configured layout stores an average width rounded to the nearest 0.5 m in its track.json entry, with a measurement method, former-border hash, sample count and source licences. Layout GeoJSON retains its original trace/timing, compact elevation/terrain and route recipes. It stores no inner, outer or ideal coordinate arrays. Existing detailed boundary/ideal authoring snapshots are preserved in .local/width-rollout/before/ and the earlier prototype archives, outside the public data tree. Source traces are unchanged.

The migration measured cross-sections against saved geometry only. It fetched no satellite data and performed no new imagery review. All layout GeoJSON is minified. Total layout data is approximately 13.9 MB, versus 127.7 MB before this rollout (89.1% smaller); track width/provenance metadata adds a small separate overhead.

The frontend calculates edges and the ideal line in a Web Worker using the existing vehicle preset, curvature QP and time refinement. Widths are per component on composed networks; route order, open endpoints, source licences, terrain and existing grade separation are retained. Open-route and width-derived surface rendering use matching paired ribbons. Old image-border refinements, old curb intervals and redundant geometry recipes are not applied to the new constant-width approximation. Inspect placement is removed from the application.

Sharp mapped bends can fold a naive normal offset. Runtime rounding now checks both local curvature and actual offset progress, with a displacement cap of half the stored width. The original trace stays untouched, and the runtime notes report the largest adjustment. The curvature solver may use up to 80 iterations. Unsupported calculation results leave the original trace and an explicit unavailable note, without a fabricated ideal line or a broken playback control.

This is the requested quick rollout, not a physical boundary audit. Constant widths omit local widening and asymmetry. Banking and vehicle calibration remain absent. A 0.1 m car-side numerical margin does not establish absolute road accuracy.

## Focused sample

Random seed: 2538931698. Fifteen distinct venues/layouts were selected, stratified as twelve closed routes, two networks and one open route. The sample covers 19 component paths and 76 corner stations, including random curved stations and a peak-curvature station on each path. Checks cover schema/runtime construction, unchanged source traces, convergence, sampled car clearance and finite playback following the calculated ideal. All fifteen pass.

The same fifteen layouts pass browser checks against the Tailscale build: removed placement controls, generated overlays, coordinate-free downloads and phone overflow. Representative network, open-run and closed-lap playback controls were exercised. External asset requests were blocked, including satellite imagery. No screenshots were taken. Six focused synthetic/unit tests, TypeScript, ESLint and the Vite build pass. No exhaustive database geometry/image validation was run.

| Track | Layout |
|---|---|
| ar-autodromo-provincia-de-la-pampa-261477881 | autodromo-de-la-pampa |
| fr-pole-mecanique-ales-cevennes-196899321 | ales |
| gb-aintree-motor-racing-circuit-121110221 | aintree-sprint |
| ar-autodromo-internacional-jose-carlos-bassi-584033696 | main |
| gb-three-sisters-d8b843ac | three-sisters-perimeter |
| mx-dorado-speedway-reference | main |
| gb-rockingham-int-supersport-ee9dd109 | rockingham-int-supersport-long |
| gb-tullyroan-oval-circuit-67c5cdb4 | tullyroan-oval-circuit |
| mz-autodromo-atcm-4afea620 | autodromo-atcm |
| us-thunderhill-raceway-park-28825115 | thunderhill-raceway-park-turn-5 |
| za-red-star-raceway-rl | main |
| mx-autodromo-tangamanga-226300277 | san-luis-potosi |
| br-autodromo-internacional-ayrton-senna-288004307 | goiania |
| gb-blyton-park-driving-centre-129241665 | blyton-park-outer |
| us-reno-fernley-f-411d3126 | reno-fernley-f |

The reproducible sample manifest, numerical/corner report and browser results are in .local/width-rollout/. Only the established persistent Tailscale preview is updated; production publication is separate.

Subsequent UI follow-up: Albert Park, Prodrive, Road Atlanta Short and its combo are explicitly unavailable. Their scalar width data is excluded and the line controls are disabled. A user can opt into a temporary road-width estimate in the browser; this never changes the database.

## Release integration

Canonical generation preserves the compact recipes, exclusions and source geometry. Release checks validate all 1,377 compact layouts, terrain coverage, 43 component networks and seven retained bridge profiles without recalculating every ideal line or reviewing imagery. Bridge ranges can wrap across the source-trace seam; their existing height evidence is reindexed using the old source offset. Independent terrain fallbacks remain available for excluded layouts. The active compact-runtime tests and historical saved-boundary compatibility suite are separated as described in CONTRIBUTING.md; historical fixtures remain in Git history.
