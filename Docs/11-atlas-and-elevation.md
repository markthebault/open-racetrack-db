# Atlas interface and terrain elevation

Implemented 2026-10-04 at the maintainer's request. The viewer remains a static Vite application with public JSON and GeoJSON files.

## Interface

The desktop catalogue sits beside the selected circuit. Phones use a search drawer with focus trapping and Escape dismissal. Country and text filters combine without clearing the selected track. Saved tracks, the last selection, view mode and height scale are stored in the current browser; disabled browser storage falls back to the current visit.

Every catalogue thumbnail is generated from its independently mapped default trace. Thumbnail simplification operates in projected metres and preserves separate branches. The 2D map, 3D model and downloads use full source coordinates. Missing layouts keep their source-gap explanation and offer no trace or download.

The Three.js view loads on demand. Reflective physical materials use a locally generated studio environment, clearcoat and a transmissive glass slab. A sampled terrain mesh and contour lines support the course ribbon. Orbit, zoom, reset and optional rotation work with mouse, touch and keyboard. Rendering pauses when hidden and stops when interaction settles. Pixel ratio is capped for phones. WebGL failure and context loss fall back to the 2D map.

The height button switches between natural proportions and clearly labelled 3× vertical exaggeration. The elevation profile always reports unexaggerated metres. Share links preserve the selected layout, view mode and height scale. Draft course status, uncertain timing positions and source information remain visible or directly accessible.

Known timing lines use contrasting strokes, location markers and labels in 3D. Shared lines read Start / finish; separate lines read Start and Finish. Labels follow the camera and show whether the position is estimated or verified. Line endpoints retain the supplied coordinates, with intermediate terrain samples for the 3D display. Timing positions remain absent when no usable source or private reference is available.

## Data and sampling

`data/elevation/<trackId>.json` stores one small geographic grid per mapped venue. It covers all mapped layouts at that venue plus a margin for the terrain model. Rows run north to south and columns run west to east. Grid dimensions, bounds, sample spacing, acquisition time and source attribution are validated with Zod.

The maintainer command `npm run elevation:fetch` reads public trace coordinates and downloads public zoom-12 [Terrarium terrain tiles](https://github.com/tilezen/joerd/blob/master/docs/formats.md) from the [Mapzen Terrain Tiles archive](https://registry.opendata.aws/terrain-tiles/). RGB values decode as `R × 256 + G + B / 256 − 32768` metres. The generator bilinearly samples a grid, normally around 80 m spacing, capped at 96 samples per axis for large venues. Stored samples are rounded to integer metres. A grid's spacing is not its source's surveyed accuracy.

`data/elevation/manifest.json` records the acquired tile URLs, SHA-256 hashes and available source modification dates. Source PNGs remain in ignored `.local/elevation-tiles/`. A normal build validates the committed grids and makes no elevation-network requests. The browser fetches only the selected venue's local grid. A missing or invalid grid gives a clearly labelled flat fallback without disrupting the course or download.

Ground samples are interpolated at the original public trace coordinates. A locally trimmed private timing preview samples its geographic coordinates in the same way; it does not change public data. Separate network branches retain separate geometry and profiles. Missing raster samples remain missing. No connector, synthetic hill, banking angle or bridge height is invented.

## Precision and source rights

Terrain estimates are useful for seeing a venue's surrounding relief and approximate climbs. Their resolution and acquisition dates vary by source. They do not survey the racing surface, bridges, banking or historical grading. The profile follows trace storage order; its first point is not asserted to be a verified timing start. Reported relief means the highest minus the lowest sampled course elevation, rather than cumulative ascent.

Terrain files retain their [underlying source rights and attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). They are separate from the ODbL course catalogue and MIT application. Each grid carries regional credits, with the complete provider list linked from the viewer. [DATA_LICENSE.md](../DATA_LICENSE.md) describes the distinction and the sampling changes.

## Verification

`npm run validate:elevation` checks all 756 mapped venue grids against every vertex of all 1,377 mapped layouts. Unit tests check interpolation orientation, bounds, missing samples, branch separation, source-coordinate preservation and finite elevations for Spa and the Pikes Peak climb.

Browser tests exercise actual WebGL rendering and orbiting, natural/exaggerated heights, unchanged measured profiles and GeoJSON, disabled external requests, missing terrain, unsupported WebGL, saved selections, share links, keyboard search, desktop and phone layouts, and WCAG accessibility checks. The catalogue test opens every venue and layout and checks download identity and missing-layout behavior. Public production screenshots are kept in `Docs/assets/atlas-*.png`.

These checks establish application behavior and terrain coverage. They do not qualify the database as surveyed or verify draft course configurations or timing positions.
