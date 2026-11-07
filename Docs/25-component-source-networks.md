# Networks with different coordinate sources

A combined configuration can use `geometrySource: "components"` when its independently identified routes come from different sources. Each component pins a mapped layout ID, its source snapshot filename and SHA-256, and the SHA-256 of the exact generated trace coordinate array. The parent snapshot also pins the complete ordered component list.

Generation rebuilds each leaf from its original source recipe. OSM leaves retain exact nodes and source versions. Image leaves retain their registered rights, raster checksum, dimensions and georeferencing. No coordinates are snapped and no connector joins independent paths. Nested networks and components needing timing-gate trimming are rejected rather than approximated. Identical route geometry is rejected even when registered under different IDs.

The output remains one GeoJSON with a `MultiLineString` trace. Actual coordinate-source IDs and combined attribution appear on that trace and its metadata. Existing border composition can embed each component's boundaries, terrain and driving parameters into the same file once all required components are supported. Meshes and video files are generated in the browser when requested.

Only exactly shared coordinate edges count once in the displayed network length. Coordinate-distinct image and OSM paths can overlap physically and are counted separately. That aggregate is neither one lap nor a measurement of unique pavement. The original OSM-only importer refuses mixed-source components so it cannot silently overwrite their provenance.

Ruapuna's five-route entry is the first use. The short Eastern route corrects a false OSM junction using 2025 LINZ imagery, while the four existing OSM routes retain their original geometry and models. The correction evidence is in `sources/research/ruapuna-eastern-route-correction.json`.
