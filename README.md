# Open Racetrack Database

Browse circuits, compare layouts, and download their geographic traces as GeoJSON. Open Racetrack Database is a small static website backed by versioned JSON, with source records for every course. Start and finish lines appear when timing evidence is available.

![Open Racetrack Database showing the Spa-Francorchamps circuit](Docs/assets/preview.png)

*Actual viewer screenshot. Course trace © OpenStreetMap contributors, ODbL 1.0. The screenshot uses public data and includes no private timing overlay.*

## European preview

The preview contains **161 venues and 170 draft traces across 25 European countries**, including the UK, Norway, and the Balkans. The acquisition inventory covers **46 countries**. Browse by country, search a venue, switch available layouts, and download an attributed GeoJSON trace.

The goal is all permanent car and motorcycle circuits across Europe. **Coverage is still incomplete:** many mapped facilities need classification or a usable course trace, and named layout confirmation remains outstanding. The viewer's European coverage panel links to the full review inventory. See [coverage and remaining work](Docs/07-european-coverage.md).

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
npm run discover:europe
npm run expand:europe
npm run generate:data
```

Discovery is serial, caches sanitized snapshots, and observes Overpass retry delays. Expansion produces draft candidates from shared OSM node IDs. It does not verify a named layout. Inspect the recipes and source notes before promoting a draft. Short courses below 1 km and routes without a closed source cycle need manual selection.

To build and serve the production preview:

```sh
npm run build
RACETRACK_TIMING_FILE=.local/timing.json PORT=5190 npm run serve
```

Validation commands are `npm run lint`, `npm test`, and `npm run test:e2e` (the latter uses installed Google Chrome and a running preview on port 5190; override with `RACETRACK_TEST_URL`). The build validates data, checks reproducible generation, and type-checks before bundling. Imports are maintainer-only; the viewer never queries Overpass.

The preview server can expose private timing positions when started with `RACETRACK_TIMING_FILE=.local/timing.json`. The timing importer reads only `Start Finish Database/StartFinishDataBase.xml`; it does not open CIR files or track maps. Keep the generated file private. Public build output excludes `.local/`.

On the Mac Mini, the current preview is available to connected Tailscale devices at [marks-mac-mini.baboon-trench.ts.net:8445](https://marks-mac-mini.baboon-trench.ts.net:8445/). Tailscale Serve proxies to the local production preview on port 5190.

## Data and code licenses

Original application code is MIT licensed. OSM-derived database content is attributed to OpenStreetMap contributors and distributed under ODbL 1.0. Source records document each input and its limits. See [Docs/README.md](Docs/README.md) for the full specification and source rules.
