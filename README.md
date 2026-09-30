# Open Racetrack Database

Browse circuits, compare layouts, and download their geographic traces as GeoJSON. Open Racetrack Database is a small static website backed by versioned JSON, with source records for every course. Start and finish lines appear when timing evidence is available.

![Open Racetrack Database showing Suzuka Circuit in Japan](Docs/assets/world-preview.png)

*Actual viewer screenshot. Course trace © OpenStreetMap contributors, ODbL 1.0. The screenshot uses public data and includes no private timing overlay.*

## Worldwide preview

The preview contains **401 venues and 410 draft traces across 52 countries**, extending beyond Europe to permanent car and motorcycle circuits worldwide. Browse by country, search a venue, switch available layouts, and download an attributed GeoJSON trace. The [worldwide coverage report](Docs/08-worldwide-coverage.md) records the current totals and source gaps.

**Coverage remains incomplete.** Draft source-cycle selections do not establish every venue, named layout, travel direction, or operating status. The viewer's worldwide coverage panel covers all 250 configured countries and territories and distinguishes fetched extracts from unavailable areas and missing acquisitions. Karting and motocross are excluded.

Track traces come only from pinned OpenStreetMap source data and explicit route recipes. Every route is currently marked **draft**. The local preview displays start/finish GPS references from the maintainer's Racelogic archive, with estimated 25 m display lines. The importer reads only the start/finish XML, never CIR files, map pictures, or track boundaries. Private timing stays outside the reusable database, downloads, and production build.

The original pilot still has unresolved data: Nürburgring's GP preview follows the mapped Sprint configuration, Anneau's nominal layout lengths need confirmation, and Nordschleife Bridge to Gantry is absent. The catalogue expansion does not mark these pilot requirements complete. See [the implementation report](Docs/06-european-preview-status.md) and [contributor workflow](CONTRIBUTING.md).

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
