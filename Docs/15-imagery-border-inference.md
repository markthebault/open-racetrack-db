# Image-derived border estimates

The border pass targets every mapped layout without the existing supplemental inner/outer features. Existing borders are preserved. The first audit identified 495 mapped layouts across 320 circuits, plus 11 layouts with no mapped route.

Run the shared batch:

```sh
npm run border:infer -- --all --write
npm run model:prepare -- --bordered
npm run validate:border-inference
npm run build
```

`--track <id>` limits acquisition to one venue. `--refresh` replaces only this tool's unreviewed estimates. A trace hash detects stale estimates. Images are cached by request hash and reused between layouts; at most three venues acquire imagery concurrently. The report is resumable and lists source/geometry gaps explicitly. Image requests time out and retry once. Raster caches and inspection sheets stay in ignored `.local/border-inference/`.

The same GeoJSON contains the two proposed border features and `metadata.borderInference`. This records the method, unreviewed estimated status, source URL and reuse evidence, attribution/licence, retrieval time, raster SHA-256, exact Web Mercator extent, image dimensions, ground pixel size and image-evidence metrics. It contains neither raster bytes nor 3D objects. One shared `data/border-inference-coverage.json` records the remaining work; there are no per-layout processing files.

The detector samples RGB image cross-sections along the existing trace, scores visible transitions after a consistent road interior and selects continuous edges. It supplies no preferred road width. Ambiguous geometry, self-crossings, broad junctions, absent coverage, coarse pixels and weak image evidence are rejected. Synthetic imagery tests check that detected widths change with the image, and that a featureless image produces no borders. Visual checks exposed runoff-edge confusion in the first scoring rule; the second version increases the road-interior penalty. Image evidence scores remain **uncalibrated**, not probabilities of positional accuracy.

Accepted outputs are **unreviewed estimates**. Shadows, vegetation, paint, gravel, aprons, historical layouts and image age can still move a detected boundary. Fine road-edge accuracy and curb placement need manual review or survey data. The UI labels estimated borders and retains the imagery credit. Derived curbs remain illustrative. A 3D model does not make the underlying borders verified.

Open routes and branch networks are deferred because inner/outer semantics and driving order need review. Unmapped layouts need independent course identification before boundary extraction. Other regions require an appropriate high-resolution source; Sentinel imagery at 10 m does not resolve typical road edges.

## Reusable sources

- USGS/USDA NAIP imagery: public-domain orthophotos, with [USGS source and accuracy information](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip).
- French IGN BD ORTHO: [Licence Ouverte 2.0 dataset](https://www.data.gouv.fr/datasets/bd-ortho-r), served by the Géoplateforme WMS.
- Spanish IGN PNOA: [CC BY 4.0 reuse conditions](https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN_eng.pdf), with producer and derivative-work attribution.
- Existing pinned high-resolution venue imagery retains its registered source, licence and reuse evidence.

The MapTiler satellite backdrop is not an extraction source: its [current Cloud terms](https://www.maptiler.com/terms/cloud/) restrict tracing, extraction, caching and bulk downloads. Esri [World Imagery feature-extraction guidance](https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/imagery/learn-to-use-ai-to-extract-information-from-world-imagery) restricts derived outputs to noncommercial use within ArcGIS. Those display services do not establish permission to redistribute inferred borders in this public dataset. Imagery with an appropriate separate licence can be registered as a future source.

## First complete missing-border pass

The pass assessed all 495 mapped layouts without existing borders. It added 46 unreviewed image-derived estimates. Of the remaining 449 mapped layouts, 241 need a registered reusable high-resolution imagery source, 135 need manual image/geometry review and 73 need open-route or branch-network interpretation. Two acquisition failures were retried successfully but their boundary proposals failed geometry checks. Another 11 layouts have no mapped route. These gaps remain in the shared coverage report; they are not filled with assumed widths.

The 46 new estimates have compact self-contained models and lap playback. Together with the existing models this gives 928 3D layouts across 547 circuits: 887 playable laps and 41 surface-only views. Original trace/timing features and the 882 previous border sets are preserved.

For supported government export/WMS sources, the 3D backdrop uses the same georeferenced imagery reference as the border extraction. Other pinned sources retain a separate display backdrop and source evidence in the GeoJSON.
