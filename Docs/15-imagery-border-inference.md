# Image-derived border estimates

The border pass targets every mapped layout without the existing supplemental inner/outer features. Existing borders are preserved. The first audit identified 495 mapped layouts across 320 circuits, plus 11 layouts with no mapped route.

Run the shared batch:

```sh
npm run border:infer -- --all --licensed-imagery --write
npm run model:prepare -- --bordered
npm run validate:border-inference
npm run build
```

`--licensed-imagery` enables the MapTiler source only when the operator has a separate agreement permitting automated extraction, working caches and redistribution of derived coordinates. Without that flag, only registered reusable sources are used. The server-only `MAPTILER_EXTRACTION_API_KEY` is preferred for acquisition; otherwise the configured `VITE_MAPTILER_API_KEY` is used. Both can come from the environment or ignored local configuration. The server-only key is never bundled in the frontend. Never put a key or a private agreement into a GeoJSON file.

`--track <id>` limits acquisition to one venue. `--refresh` replaces only this tool's unreviewed estimates. A trace hash detects stale estimates. Government exports are cached by request hash. Licensed satellite tiles are cached by XYZ coordinate and only the road search corridor is acquired, so nearby layouts share downloads; at most three venues acquire imagery concurrently. The report is resumable and lists source/geometry gaps explicitly. Image requests time out and retry once. HTTP 429 responses persist the provider retry time and stop further requests during that window. `--retry-failed` retries only acquisition/quota failures and preserves the other report rows. Raster caches and inspection sheets stay in ignored `.local/border-inference/`.

The same GeoJSON contains the two proposed border features and `metadata.borderInference`. This records the method, unreviewed estimated status, source URL and public reuse evidence or a source-specific agreement reference, attribution/licence, retrieval time, raster SHA-256, exact Web Mercator extent, image dimensions, ground pixel size and image-evidence metrics. Licensed sources also store the provider, tile zoom and bounds, with no credentials. The runtime assembles parent tiles into a cropped texture of at most 2048 pixels per side. This preserves the saved ground extent while limiting mobile GPU memory. It contains neither raster bytes nor 3D objects. One shared `data/border-inference-coverage.json` records the remaining work; there are no per-layout processing files.

The detector samples RGB image cross-sections along the existing trace, scores visible transitions after a consistent road interior and selects continuous edges. It supplies no preferred road width. Ambiguous geometry, self-crossings, broad junctions, absent coverage, coarse pixels and weak image evidence are rejected. Synthetic imagery tests check that detected widths change with the image, and that a featureless image produces no borders. Visual checks exposed runoff-edge confusion in the first scoring rule; the second version increases the road-interior penalty. Image evidence scores remain **uncalibrated**, not probabilities of positional accuracy.

Accepted outputs are **unreviewed estimates**. Shadows, vegetation, paint, gravel, aprons, historical layouts and image age can still move a detected boundary. Fine road-edge accuracy and curb placement need manual review or survey data. The UI labels estimated borders and retains the imagery credit. Derived curbs remain illustrative. A 3D model does not make the underlying borders verified.

Open routes and branch networks are deferred because inner/outer semantics and driving order need review. Unmapped layouts need independent course identification before boundary extraction. The licensed source supplies global coverage where available; Sentinel imagery at 10 m does not resolve typical road edges.

## Reusable sources

- USGS/USDA NAIP imagery: public-domain orthophotos, with [USGS source and accuracy information](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip).
- French IGN BD ORTHO: [Licence Ouverte 2.0 dataset](https://www.data.gouv.fr/datasets/bd-ortho-r), served by the Géoplateforme WMS.
- Spanish IGN PNOA: [CC BY 4.0 reuse conditions](https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN_eng.pdf), with producer and derivative-work attribution.
- Existing pinned high-resolution venue imagery retains its registered source, licence and reuse evidence.

MapTiler extraction is enabled under an operator-confirmed separate imagery agreement. Its private text is held outside the repository. The derived features use `LicenseRef-MapTiler-Derived-Borders` and `rightsBasis: source-specific-agreement`; this is not an open-imagery licence or a claim that the agreement was independently reviewed. The [standard Cloud terms](https://www.maptiler.com/terms/cloud/) alone do not authorize tracing, extraction, caching or bulk downloads. Esri [World Imagery feature-extraction guidance](https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/imagery/learn-to-use-ai-to-extract-information-from-world-imagery) restricts derived outputs to noncommercial use within ArcGIS. Those display services do not establish permission to redistribute inferred borders in this public dataset. Government imagery is preferred where supported. The licensed source is tried when other coverage or its image evidence fails. Existing successful estimates are cached and preserved.

## Coverage

The batch assessed all 495 mapped layouts without existing borders, plus 11 layouts without mapped routes. It saved 74 unreviewed estimates: 46 from the initial reusable-source pass and 28 from licensed satellite imagery. The remaining mapped layouts comprise 257 needing image/geometry review, 73 needing open-route or network interpretation and 91 awaiting the imagery provider's request quota reset. The report records the retry time. These gaps remain explicit.

All 74 estimates have compact self-contained models and lap playback. Together with existing models this gives 956 3D layouts across 562 circuits: 915 playable laps and 41 surface-only views. Original trace/timing features and all 882 previous border sets are preserved.

For government export/WMS and licensed tiled sources, the 3D backdrop uses the same georeferenced imagery reference as the extraction. Pinned sources retain a separate display backdrop and source evidence in the GeoJSON. External imagery availability and quotas can affect the backdrop; saved road geometry and lap playback remain usable.
