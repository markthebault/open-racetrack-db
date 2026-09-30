# Product and map viewer

## 1. User outcome

A visitor opens a map, finds a venue, selects a layout, and sees its route and timing lines. A contributor can add a venue through files without changing application code.

The route is a line that represents the course. It is not a surveyed centerline or an optimal driving path. Use the label `Track trace` in the interface.

## 2. Required interface

Use a map and one information panel. On desktop, put the panel beside the map. On narrow screens, stack the controls and map. Keep the map at least 300 CSS pixels high at a 375-pixel viewport width.

The panel MUST contain:

1. Project name and a short description.
2. Search input with a visible label.
3. Country selector with an `All countries` option.
4. Venue list and visible result count.
5. Selected venue name, country, and optional locality.
6. Layout selector with readable layout names.
7. Geometry and timing status for the selected layout.
8. Measured trace length, labelled as approximate.
9. Route type: `Closed circuit` or `Point-to-point`.
10. A short note for a timing variant or unresolved source fact.
11. `Fit layout` and `Download GeoJSON` controls.
12. A sources disclosure with links, dates, and license information.

Use native input and select elements. Use text labels in addition to color. The application language is English in v1. Preserve accents in venue names.

## 3. Catalogue behavior

On first load, fetch the generated index. Show one marker per venue. Fit the map to the included venues. The pilot is a European catalogue, but the map supports all countries.

Filter the list and venue markers by country and search together. Search venue names, aliases, and locality. Ignore case and diacritics. Sorting is by country name, then venue name. No geocoding request is needed.

Selecting a venue loads its metadata and its default layout. Selecting a marker and selecting the same venue in the list have identical results. Highlight the current venue.

If a filter removes the selected venue, clear its selection, trace, and gates. Show the filtered markers. Show `No tracks match your filters` for an empty result. Provide a clear way to reset filters.

No clustering library is required for three venues. Revisit clustering when the catalogue is large enough to justify it.

## 4. Layout behavior

Changing layout MUST update the same page. It MUST update the trace, timing lines, labels, status, length, source details, and download target as one selection.

Maintain one Leaflet map instance. Put the selected route and gates in a replaceable layer group. Remove the old layers before exposing the new selection as ready.

During loading, show the requested layout name with a loading state. Clear the previous route and disable download. If the request fails, show a retry action. Do not leave the previous geometry under the new layout's name.

Prevent stale responses from replacing a newer selection. Use an abort controller or a monotonically increasing request ID. A sequence of A, B, C selections must finish with C even when A resolves last.

Fit the map when the selected layout finishes loading. `Fit layout` restores that view after manual pan or zoom. Account for the visible panel and labels when fitting bounds.

Do not create a page per layout. An earlier prototype had a layout-switching failure; this behavior requires a browser regression test.

## 5. Trace and timing presentation

Render the trace as an amber or orange line with a dark outline. A suggested starting style is a 5-pixel trace over an 8-pixel outline. Keep styles in one configuration object.

Render these gate roles:

| Role | Label | Suggested display |
| --- | --- | --- |
| `start_finish` | Start / finish | Contrasting line with a labelled marker |
| `start` | Start | Green line with a labelled marker |
| `finish` | Finish | Red line with a labelled marker |

The gate is a geographic two-point line. Its marker sits at the line midpoint. The marker label remains available if the line is too short to see at the current zoom.

Gate details MUST show whether the position is verified or estimated. They MUST also show whether the endpoints were supplied by a source or generated for display. A verified source point with generated endpoints is valid, but it is not a surveyed line.

For a missing gate, show `Start/finish position not yet verified` or the corresponding separate-gate message. For a partial pair, show the available gate and name the missing one. Never substitute the first trace point, `[0, 0]`, or the venue marker.

Draft data MUST carry a visible `Draft` label. Estimated gates use a dashed line and an `Estimated position` label. Verified positions can use a solid line even when endpoint width is a display estimate; disclose the endpoint method in details.

The map displays one selected layout at a time. Multi-layout overlays and side-by-side comparisons are outside v1.

## 6. Addressable selection

Use query parameters `track` and `layout` for a selected record. IDs are the stable IDs in the data contract.

Example shape: `?track=de-nurburgring&layout=grand-prix`.

- A valid track without a layout opens its default layout.
- An unknown track returns to the catalogue and shows a short message.
- An unknown layout opens that venue's default and shows a short message.
- Selection updates the URL without a full-page load.
- Browser Back and Forward restore the selection.
- Reloading a valid selection restores the same venue and layout.

Use query parameters so static hosts need no application-route rewrite. Support a configured deployment base path, including a repository subdirectory. Resolve data URLs relative to that base.

## 7. Static architecture

Use Vite, TypeScript, Leaflet, and ordinary HTML/CSS. A component framework and global state library are unnecessary. Use the current supported Node.js LTS at implementation time, and record the selected major version in the repository.

Install dependencies through npm. Bundle them locally. The running website must not depend on a JavaScript CDN.

Recommended modules:

- Catalogue loader and search.
- Venue/layout loader with runtime schema validation.
- Map rendering and layer replacement.
- Selection and URL state.
- Panel rendering.
- Shared data types and schemas.

These are responsibility boundaries, not a requirement for one file per bullet. Keep the implementation small.

Runtime flow:

`index.json -> selected track.json -> selected layout GeoJSON -> Leaflet layers`

The importer runs only as a maintainer command. The website does not query Overpass or read source recipes. Building the website does not refresh OSM data.

The static build contains the viewer and the public `data/` tree. Use an explicit copy step. Do not copy the repository root, source snapshots, test fixtures, or local comparison files into the build.

## 8. Map tiles and attribution

For the pilot, use the standard OSM raster tiles with visible OpenStreetMap attribution. Put the tile URL, attribution, and maximum zoom in one configuration location. This lets the maintainer replace the provider.

Use ordinary browser tile requests and caching. Preserve the browser Referer. Do not add bulk tile downloads, prefetch, or offline map caching. If public usage grows, review provider capacity before launch. These requirements follow the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

Show database attribution in the information panel as well as tile attribution on the map. Changing the basemap does not remove the trace data's attribution requirement.

If tiles fail, keep the catalogue and vector trace usable. Show a small `Background map unavailable` notice. Avoid one alert per failed tile.

## 9. Error handling and accessibility

- A failed index request shows a retry action and no misleading empty catalogue.
- Invalid venue metadata affects that selection, not every venue.
- Invalid GeoJSON shows a data error; do not draw it partly as if valid.
- All controls work with a keyboard and have visible focus.
- Loading and error text use an appropriate live region.
- Source strings are rendered as text, not injected HTML.
- Source links accept only `https:` or `http:` URLs.
- A map is not the only way to choose a venue or layout.
- A blocked tile provider does not fail the core browser tests.

## 10. Performance boundary

Fetch the catalogue first. Fetch venue metadata and geometry on selection. Cache those files in memory for the current browser session. Do not preload every global layout.

Retain source coordinates for the pilot. Avoid smoothing, resampling, and simplification until measured rendering problems justify them. Loading states must remain responsive while the user switches selections.

For future growth, the same static catalogue is sufficient until its actual size becomes a problem. Do not add a database service, server search, or vector-tile pipeline in v1.
