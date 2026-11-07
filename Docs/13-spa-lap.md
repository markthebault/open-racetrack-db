# Spa lap preview

Select **Spa-Francorchamps → Play lap**, or open `/?track=be-spa-francorchamps&lap=1`.

The UI includes normal-speed playback, pause, restart, seeking, chase/driver/above/orbit cameras, aerial-image inspection, editable car parameters, live telemetry and browser video recording. Click the minimap, aerial map or 3D explore view to select a section. Recording starts a fresh flying lap at 1× speed; switching cameras or seeking stops the recording. A hidden tab pauses playback. Download the result from the UI.

## Stored data, generated geometry

The single layout file, `data/belgium/spa-francorchamps/layouts/grand-prix.geojson`, now includes everything specific to Spa needed to rebuild the road and surrounding terrain. Its existing trace/border features are unchanged; the optional, versioned `metadata.model3d` block holds:

- `startOffsetM` and `referenceLengthM`: the published station reference and approximate alignment to the existing timing anchor.
- `elevation` and `elevationMethod`: 19 `[distanceM, altitudeM]` anchors and periodic monotone interpolation; `bankingDeg: 0` records the flat-banking assumption.
- `curbs`: 20 distance intervals with driver-relative side, width and height **above the asphalt**, all in metres. `curbStyle` stores stripe length and ordered colours.
- `corners`: named distance stations for telemetry labels.
- `terrain`: the original 25 × 34 raster grid, bounds, sample spacing and source credits, embedded without resampling.
- `imagery`: the remote image URL, its EPSG:3857 extent and attribution. `sources` preserves elevation/imagery references and accuracy notes.

The extension is approximately 7.5 KB before compression, including the terrain. The separate `data/simulation/spa.json` and `data/elevation/be-spa-francorchamps.json` files have been removed. Venue identity/catalogue entries still live in the normal `track.json` and index; geometry is stored once per layout, not once per camera or car. No GLTF, OBJ, mesh, baked animation or per-frame car positions are stored. Actual imagery remains a remote resource, rather than being embedded as image bytes.

The main viewer, lap playback and downloaded GeoJSON all read the same embedded model. The shared player also supports the [20 additional popular layouts](14-popular-3d-models.md). Generic vehicle settings, camera behaviour and mesh-building algorithms remain shared application code. Other layouts can omit `model3d` and continue to use their existing terrain files. Regeneration preserves the extension, and the terrain-fetch command refreshes embedded terrain in place rather than recreating a Spa sidecar.

Opening the lap lazily loads its code and reads the recipe from the already-loaded GeoJSON. `src/lap-simulation.ts` projects geographic coordinates into local metres, samples a closed curve, intersects the existing asymmetric borders with cross-sections, and creates a disposable road. Missing cross-sections interpolate between valid source intersections. Border data keeps its separate feature-level licence; the simulation does not relabel it as OSM. The driving path is the midpoint of these cross-sections. Segment lengths include elevation and lateral displacement.

`src/lap-scene.ts` creates the road ribbons, edge paint, curbs, generic car and terrain in memory. Closing the view disposes geometry, textures, controls, observers and the WebGL context, and aborts pending image loading. The orthophoto is fetched on demand from SPW; it is not duplicated in this repository. At the current request size it is about 3.6 MB, independent of the GeoJSON parameters. Video files are user-generated exports, not track database assets.

## Elevation and imagery

- [Official circuit access map, page 3](https://www.spa-francorchamps.be/assets/e70cff50-ae5d-4aaa-896b-54c8a953a357/all-plan-acces.pdf): published distance/altitude pairs from 0 to 7004 m, 373–470 m altitude. Periodic monotone cubic interpolation preserves every anchor without overshooting the hills. Rendered vertical and horizontal units are both metres, with no exaggeration.
- The saved GPS gate aligns with the finish line. The venue map uses its separate start line for distance stations. A **180 m approximate offset**, checked against the map and imagery, aligns the simulation origin; it is not a surveyed timing correction, and the public layout is unchanged.
- [SPW Orthophotos 2024](https://geoportail.wallonie.be/catalogue/38cb73b9-def6-43bd-a96f-f5d7a487e697.html): aerial orthoimagery (not satellite photography), displayed with its returned EPSG:3857 extent. Native service resolution is 25 cm; the requested overview is resampled to about 0.6 m per pixel. Image orientation is explicitly flipped for WebGL ImageBitmap textures. Credit: © SPW 2025.
- The existing Mapzen ~80 m raster supplies surrounding terrain. Near the road it blends toward the longitudinal road profile so raster noise cannot override the published road heights.

**Limits:** source road edges are inspectable against the image but remain unverified; this implementation does not automatically extract new asphalt boundaries. Widths are derived from the existing borders, and some cross-sections are oblique in tight corners. Curb locations were visually estimated from the aerial image; widths and 0.08 m height above asphalt (0.16 m lift above the road baseline) are illustrative. Elevation between the 19 anchors is interpolated. Banking, bridge detail and current surveyed track-surface elevations are unavailable. This is an approximate reconstruction, not a survey or a geometrically qualified simulator.

## Car and solver

Defaults: 300 mechanical hp (223.71 kW) at the engine, 85% drivetrain efficiency, 1400 kg, 260 km/h cap, 1.2 g braking, 1.1 g lateral grip, 0.55 g drive-traction cap, CdA 0.66 m², air density 1.225 kg/m³ and rolling coefficient 0.015. Unknowns are assumptions, editable where exposed in the UI. More power does not guarantee reaching the speed cap.

A periodic forward/backward speed planner uses `v² = u² + 2 a ds`. Acceleration is constrained by wheel power, drag, rolling resistance and gravity on the slope. Braking and drive traction use combined-grip ellipses with lateral acceleration `v² × curvature`. Curvature uses a ~24 m chord to reduce digitisation noise. Conservative endpoint bounds and bisection enforce constraints through each segment. The recorded car follows the geometric midpoint, with no racing-line optimisation, gearbox, aero downforce or transient tyre/suspension model. One flying lap is about **3:13**, reaching approximately **219 km/h** with this recipe; this is a model output, not a real-car lap-time claim.

## Verification

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
# With the built app served locally:
RACETRACK_TEST_URL=http://127.0.0.1:5193 npx playwright test tests/spa-lap.spec.ts
```

Physics tests check exact elevation anchors, closure, continuous time/distance playback, every segment's speed/power/combined-grip limits, power sensitivity, slope sensitivity and an analytic constant-radius case. Browser tests check lazy opening and disposal/reopening, controls, cameras, spatial seeking, car changes, phone overflow/scrolling, video export, single-file downloads without sidecar requests, and usable fallback when imagery fails. Live SPW imagery loading was also checked separately; deterministic browser tests use a tiny substitute raster.

## Camera motion

The follow cameras sample the driven midpoint continuously by accumulated metres, including the closed-loop seam. A short spatial filter removes digitisation noise from the camera heading. A critically damped spring follows both the mount and its aim in seconds, with exact integration for a linearly moving target; this keeps behaviour consistent across frame rates. The horizon uses world up, and car yaw follows the midpoint tangent rather than the original trace heading. Seeks, restarts and camera changes reset the spring immediately. The road mesh, elevation profile and speed solver are unaffected.

`tests/lap-camera.test.ts` checks continuity at every source vertex and the seam, paused frames, absence of spring overshoot, full-lap angular motion, 30/120 fps agreement and reset behaviour. The camera trajectory is generated in memory; it adds no track data or stored animation frames.

The general stationing field is `referenceLengthM`: Spa uses the venue reference, while generated models use the mapped trace length and declare that provenance in `quality.stationing`. Previously downloaded Spa files using `officialLengthM` remain readable.

The chase mount also checks explicitly elevated road sections for overhead obstructions. It lowers before the look-ahead target reaches an underpass and rises after the trailing camera clears the deck. A smooth spatial transition and the existing time-based damping avoid a height snap, including across a timing seam. The rendering margin does not alter or assert the bridge clearance. Tests cover both branches, unmarked flat crossings, timing-seam continuity and frame-rate agreement. Central Circuit's complete normal-speed recording was reviewed through the crossing with the car visible; no animation frames are stored in the track file.
