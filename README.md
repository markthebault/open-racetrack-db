# Open Racetrack Database

Browse circuits, compare layouts, and download their geographic traces as GeoJSON. Open Racetrack Database is a small static website backed by versioned JSON, with source records for every course. Start and finish lines appear when timing evidence is available.

![Open Racetrack Database showing Suzuka Circuit in Japan](Docs/assets/world-preview.png)

*Actual viewer screenshot. Course trace © OpenStreetMap contributors, ODbL 1.0. The screenshot uses public data and includes no private timing overlay.*

## Worldwide preview

The viewer contains **763 venues across 74 countries**, with every one of the **1,007 supplied layout entries** registered. Search a venue, select a layout, and download an attributed GeoJSON trace when geometry is available.

**457 supplied entries have draft course traces; 550 still need geometry.** The catalogue also retains additional independently mapped course candidates. An unavailable layout clears the map trace and has no download button. The [layout coverage report](Docs/09-layout-coverage.md) lists every entry and remaining geometry gap.

Course coordinates come from pinned OpenStreetMap data and explicit route recipes. All traces remain drafts. Some configurations are hypotheses selected by timing proximity and declared course distance; they still need visual review. A length match alone does not prove a layout is correct.

The private preview uses local start/finish GPS and estimated display lines. The importer reads layout names, scalar course distances and timing GPS from a single timing XML entry. It never reads CIR files, track pictures or boundaries. Private timing stays outside the public database, downloads and build.

Nürburgring now has nine catalogue entries, with distinct GP and Sprint traces. Separate-gate entries use a supporting independent loop in public downloads; local timing trims the private preview. Independently reusable open-course endpoints remain missing.

## Run locally

Use Node.js 24 LTS and npm (Node 26 also works for the current preview):

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Committed data is sufficient to run the viewer. Maintainers can acquire and resume country discovery separately:

```sh
npm run discover:world
npm run expand:world
npm run generate:data
```

Worldwide discovery sends serial batches of at most 12 countries, separates results by explicit OSM country-area markers, caches sanitized snapshots, and observes Overpass retry delays. `OVERPASS_ENDPOINT` can select another provider. Expansion produces draft candidates from shared OSM node IDs. It does not verify a named layout. Inspect the recipes and source notes before promoting a draft. Worldwide courses below 500 m and routes without a closed source cycle need manual selection.

To build and serve the production preview:

```sh
npm run build
RACETRACK_TIMING_FILE=.local/timing.json PORT=5190 npm run serve
```

Validation commands are `npm run lint`, `npm test`, and `npm run test:e2e` (the latter uses installed Google Chrome and a running preview on port 5190; override with `RACETRACK_TEST_URL`). The build validates data, checks reproducible generation, and type-checks before bundling. Imports are maintainer-only; the viewer never queries Overpass.

The preview server can expose private timing positions when started with `RACETRACK_TIMING_FILE=.local/timing.json`. The timing importer reads only `Start Finish Database/StartFinishDataBase.xml`; it does not open CIR files or track maps. Keep the generated file private. Public build output excludes `.local/`.

On macOS, `npm run preview:install` copies the build and optional private timing overlay into the user's Application Support folder and installs a LaunchAgent on localhost port 5190. Run it after rebuilding to update the persistent preview. Reinstall after changing the Node installation. The overlay stays outside the copied public build.

On the Mac Mini, the current preview is available to connected Tailscale devices at [marks-mac-mini.baboon-trench.ts.net:8445](https://marks-mac-mini.baboon-trench.ts.net:8445/). Tailscale Serve proxies to the local production preview on port 5190.

## Data and code licenses

Original application code is MIT licensed. OSM-derived database content is attributed to OpenStreetMap contributors and distributed under ODbL 1.0. Source records document each input and its limits. See [Docs/README.md](Docs/README.md) for the full specification and source rules.

## Layout completeness

The supplied catalogue defines the expected layout names and timing conventions. [Every entry](sources/reference/catalogue.json) points to exactly one venue and layout, including entries whose geometry is unavailable. The [coverage report](Docs/09-layout-coverage.md) counts catalogue entries and actual traces separately.

To repeat catalogue registration, independent course matching and coverage checks:

```sh
npm run catalogue:complete -- --archive /absolute/path/to/tracks.zip
npm run generate:data
npm run recover:variants -- --archive /absolute/path/to/tracks.zip
npm run generate:data
npm run catalogue:complete -- --archive /absolute/path/to/tracks.zip
npm run audit:layouts -- --archive /absolute/path/to/tracks.zip
npm run import:timing -- --archive /absolute/path/to/tracks.zip
```

Country extracts must already be available for course matching. Only unique, connected source cycles that pass conservative timing and distance checks become draft hypotheses. Ambiguous graphs, missing ways, street courses and open routes remain in the gap list. No trace is synthesized to make the counts match.
