# Track borders: OSM investigation and reproduction

Checked live OSM on **2026-11-04**. Use these option names:

- **Option 1: OSM only.** Use mapped track-surface boundaries, or OSM centreline segments with explicit mapped widths. No satellite imagery or invented width. Width-based offsets remain estimates of edge positions.
- **Option 2: satellite imagery + custom road width.** Overlay the OSM centreline and calculated borders on MapTiler imagery. Current demos assume a constant **12 m**, adjustable in the viewer. They do **not** measure width from the image.

## Findings and how to check again

OSM can store `width=*` (metres by default), `est_width=*` (estimated), and track-surface polygons tagged `area:highway=raceway`. A facility perimeter is not a track edge. A mapped width alone does not establish exact edges or a perfectly centred trace.

Download the live XML extracts using these URLs:

- Spa: `https://www.openstreetmap.org/api/0.6/map?bbox=5.955,50.425,5.985,50.455`
- Meppen: `https://www.openstreetmap.org/api/0.6/map?bbox=7.274,52.752,7.289,52.762`

For each extract, inspect tags on `highway=raceway` ways for width-related keys. Inspect ways and relations for `area:highway=raceway`, plus `highway=raceway` + `area=yes`; confirm any candidate represents the road surface. Reconstruct polygon relation members when present.

**Result for both circuits:** no width-related tags on raceway ways and no track-surface polygons under those tags. Their centrelines are available, but option 1 cannot currently produce their inner/outer borders. Leave borders unavailable rather than silently substituting option 2. The existing importer requests raceway ways and timing nodes, so saved extracts alone cannot establish surface-polygon coverage.

## Reproduce option 2

The commands below require the local prototype in `examples/`, which is not included in this documentation-only change. The numbered steps also describe how to recreate it. From the repository root, with Python 3 and Pillow installed:

```sh
python3 examples/spa-osm-borders/generate.py --track spa
python3 examples/spa-osm-borders/generate.py --track meppen
```

Open `examples/{spa,meppen}-osm-borders/index.html`. The generator:

1. Reads only the `trace` feature from `data/belgium/spa-francorchamps/layouts/grand-prix.geojson` or `data/germany/circuit-meppen-206291125/layouts/main.geojson`. Both traces are drafts. Existing supplemental borders are excluded.
2. Loads `VITE_MAPTILER_API_KEY` from `.env` in this checkout or the main checkout. Fetches `https://api.maptiler.com/tiles/satellite/{z}/{x}/{y}.jpg?key=...` at zoom 16 for Spa, 17 for Meppen. Caches tiles under ignored `.local/`, stitches them, and embeds the image without the key. Retains MapTiler/OSM attribution.
3. Projects longitude/latitude into Web Mercator, subtracts the first-point origin, and scales both axes by `cos(origin latitude)` to approximate local metres. Image placement uses the same tile coordinates and projection.
4. Offsets the trace by `width / 2` on each side using segment normals and capped mitre joins (maximum factor 2). Signed loop area identifies the inner side. Closes both paths. GeoJSON exports explicitly label the borders as estimates.

## Measuring width from imagery: possible extension, not implemented

At several clear locations, draw cross-sections perpendicular to the local trace and identify the two asphalt edges. Project both endpoints into the same local metric plane; their Euclidean distance estimates width. Retain separate left/right distances if the OSM trace is off-centre. Record locations, imagery source/date and uncertainty; interpolate samples only after review. Do not count runoff as track surface. Meppen's imagery appears to show construction and its capture date is unknown, so it cannot establish current asphalt edges here.

References: [OSM width](https://wiki.openstreetmap.org/wiki/Key:width), [OSM raceway surface](https://wiki.openstreetmap.org/wiki/Tag:area:highway=raceway), [MapTiler tiles API](https://docs.maptiler.com/cloud/api/tiles/).
