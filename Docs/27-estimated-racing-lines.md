# Ideal line

Layouts with a calculated `ideal` GeoJSON feature have an **Ideal line** display toggle. It is off by default and works in Map, Satellite and 3D views. Downloading a layout includes its line. The source trace, borders, timing, elevation models and their licences are preserved.

## Data

The optional feature uses `id: "ideal"`, `properties.role: "ideal"`, `estimated: true`, the method version, an edge margin in metres and the source border licence identifiers. A LineString represents a single corridor; MultiLineString represents independently calculated component corridors in a network. Network lines do not assert a unique racing order through junctions. When every exact embedded source component already has a validated ideal line, the generator can reuse those paths in component order, preserving open endpoints and lap closures. It rejects missing lines or changed source components. The composed feature records the minimum edge margin guaranteed by all its components. No meshes or duplicated border arrays are added.

The line is derived from the saved boundaries, so their separate licences continue to apply. It is not relabelled as an OSM source trace. Existing route/model fingerprints exclude this display-only derived feature; the crossing audit still fingerprints complete layout files.

## Calculation

`npm run ideal:generate` runs four independent numeric worker processes and writes both the GeoJSON features and `data/ideal-lines-coverage.json`. Detailed intermediate logs are in `.local/ideal-generation/`.

The first pass constructs a boundary-normal corridor and samples approximately every 9 m. A finer direct-boundary pass attempts tight or irregular corners. Short corner-cutting chords are repaired only when the complete replacement fits the same source footprint with the required clearance. Local backtracking loops are removed while preserving the cycle around the source island; a blocked or too-narrow corridor is never widened. A nearest-visible-edge pass handles valid rings whose normal rays hit a distant branch. It excludes reference samples that cannot accommodate the preset only when the final validated cycle still wraps the unchanged source island. Bounded grid routing can follow multi-corner detours without crossing or removing dividers. Final passes use the existing ordered road reconstruction, including explicitly grade-separated routes. Layouts that fail topology or width checks remain unavailable and are recorded in the coverage file rather than receiving an invented path.

The fixed illustrative dry-condition vehicle preset is in `src/ideal-line-model.ts`: 1,350 kg, 410 kW, 2.05 m width, 285 km/h speed ceiling, 1.55 g mechanical lateral grip, an assumed additional 0.85 g at 200 km/h, and a 3 g lateral ceiling. These are assumptions, not measured tyre/aero data.

An existing shared-ground reconstruction can also supply the corridor. These lines record `boundaryModel: "shared-ground-v1"` and include the reconstruction imagery licence in `borderLicenses`. The optimizer retains every source station in order and bounds lateral movement by the complete adjacent source segments' clearance, preserving the source route through its grass islands. Every resulting segment is checked continuously against the saved reconstructed footprint. No source boundary or reconstruction pin is changed. Composed networks do not currently reuse this boundary-model-specific feature.

For projected source crossings with unpaired closed borders, a source-order pass aligns both complete edge curves in source travel order. It inserts samples on original segments, retains every original vertex and uses monotonic dynamic alignment within a 120 m station band. The alignment rejects widths below the vehicle envelope, widths above 45 m, folded cells and intersecting cells. Each ideal segment must clear a simple local strip extending 20 m in both travel directions, continuously along the whole segment. This avoids treating the other visit to a projected crossing as an obstacle. The final line must preserve the source crossings and their order, within 45 m in position and 120 m in relative route station. These lines record `boundaryModel: "ordered-border-ribbon-v1"`. They are two-dimensional estimates with a flat optimization profile; they do not establish bridge elevation, vertical clearance or a calibrated lap time. Original borders, source route and elevation models remain unchanged.

A final planar recovery handles simple nested corridors where the complete vehicle fits with less than 0.1 m additional margin. It records `boundaryModel: "continuous-planar-v1"` and an explicit 0.01 m edge margin. The 2.05 m vehicle width remains unchanged. The complete source annulus is retained; local reference-point refinements move at most 2 m and are accepted only through whole-segment clearance checks. Lateral optimizer bounds use both adjacent complete segments' clearance. Every final segment must continuously clear half the vehicle width plus the recorded margin and a 0.002 m numerical reserve. The simple final cycle must enclose every original inner-edge vertex and no outer-edge vertex. The smaller margin describes the numerical geometry, not measured clearance on the real road.

Bounded coordinate descent minimizes discrete integrated curvature squared. Smooth local lateral perturbations at 100, 60 and 35 m scales refine the path using a forward/backward power/braking speed model with combined grip. The speed refinement is checked with a more precise solve against its curvature seed. Subsequent footprint-containment repairs may increase distance or travel time; that seed comparison is not a claim about the final repaired line. This independent heuristic uses concepts from [TUM's trajectory project](https://github.com/TUMFTM/global_racetrajectory_optimization); it does not execute or vendor TUM's optimizer, and does not establish a global minimum-time solution.

Unambiguous source-boundary corridors are checked every metre against the saved road rings and nearest edges, allowing half the vehicle width plus the feature's edge margin. Most features retain 0.5 m extra clearance; the narrow recovery pass allows 0.1 m; the continuous planar pass records 0.01 m with the continuous checks described above. Local self-crossings in a saved border need not prevent a planar line: the nearest-edge pass retains every original segment as a clearance obstacle and uses its unchanged even-odd footprint. Its final simple cycle must enclose every inner-edge vertex and no outer-edge vertex, in addition to passing the footprint and width checks. A projected crossing that cannot satisfy that separation remains unavailable through this method. Explicit grade-separated source reconstructions use their ordered layer-specific ribbon bounds instead of treating another level's edges as obstacles. This is a sampled width-envelope check, not full-body swept-volume qualification.

Closed boundary reconstructions use flat banking and elevation; recovery from saved road models can include their estimated longitudinal slope. Banking, kerbs, vertical compression, transient handling, surface variation and telemetry calibration remain absent. The display name “Ideal line” describes an estimated racing-line overlay, not a certified driving target or a prediction of real lap records.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
RACETRACK_TEST_URL=http://127.0.0.1:5194 npx playwright test tests/ideal-lines.spec.ts
```

Tests cover optional schema and licence scope, canonical serialization/regeneration, unchanged model fingerprints, the speed envelope, opt-in display, embedded download, 2D/3D toggle behavior, mobile overflow and stale-line clearing on layout changes. Catalogue generation preserves the derived feature while rebuilding the independently sourced geometry.
