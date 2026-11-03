# Database license and attribution

The public track catalogue and OSM-derived trace data are made available under the Open Database License 1.0 (ODbL). See the [ODbL text](https://opendatacommons.org/licenses/odbl/1-0/) and the [OpenStreetMap copyright and attribution page](https://www.openstreetmap.org/copyright).

Credit OpenStreetMap contributors when using the database. The source snapshots and each venue's `review.md` identify the OSM material used to generate its traces. The OSM-derived data remain separate from the MIT-licensed application code in [LICENSE](LICENSE).

Authoring inputs and processing procedures are maintained separately from the public application and database.

## Optional track borders

Some layout GeoJSON files include `inner` and `outer` features. They are separate supplemental data, not OSM-derived route coordinates. Their feature-level `license` value is `LicenseRef-Track-Borders`. This identifier denotes a separate rights scope: this repository makes no additional redistribution or commercial-use license grant for these features. Obtain suitable permission before reusing them beyond the rights you already hold.

When borders are present, `metadata.licenseScope` is `trace-and-timing`: the collection's ODbL declaration and OSM attribution apply to its original trace and applicable timing data, not to the supplemental border features. Borders have no borrowed OSM source IDs. Application code remains MIT. Neither a display option nor inclusion in a GeoJSON download changes the rights attached to a feature.


## Terrain grids

`data/elevation/` is a separate collection of approximate ground-elevation grids derived from [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/). It retains the underlying terrain providers' rights and attribution requirements; the application does not relicense those inputs as ODbL or MIT. Each venue file includes source credits. The [provider's attribution and license details](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) identify USGS and NOAA global datasets, Copernicus EU-DEM and regional sources from Australia, Austria, Canada, Mexico, New Zealand, Norway and the United Kingdom, plus ArcticDEM.

The public manifest records the original tile URLs and SHA-256 hashes. Modification consists of Terrarium RGB decoding, bilinear sampling onto geographic venue grids and rounding to integer metres. Runtime interpolation and labelled vertical exaggeration affect the display. Neither changes the independently sourced public track coordinates or GeoJSON downloads. The viewer credits terrain beside the model and gives regional credits under Track notes & sources → Elevation data.
