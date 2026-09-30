# European preview status

The requested expansion adds 15 EU venues. The catalogue now has 18 venues and 27 selectable layouts across Austria, Belgium, France, Germany, Italy, the Netherlands and Spain.

| Added venue | Layouts |
| --- | --- |
| Hockenheimring | Grand Prix, National, Short |
| Spa-Francorchamps | Grand Prix |
| Zolder | Main circuit |
| Zandvoort | Grand Prix |
| Assen | Main circuit |
| Monza | Grand Prix |
| Imola | Without / with Variante Bassa |
| Misano | International long / short |
| Mugello | Grand Prix |
| Paul Ricard | Chicane Nord / Mistral straight |
| Magny-Cours | Grand Prix |
| Le Mans Bugatti | Bugatti circuit |
| Barcelona-Catalunya | Without / with final chicane |
| Jerez | Car circuit / motorcycle circuit |
| Valencia | Grand Prix |

## Source and data status

All trace coordinates come from sanitized, pinned OSM snapshots. Each layout has an explicit recipe containing exact way versions and inclusive indices. Every join uses a shared OSM node ID. Course plots were inspected and pit/service, training, karting and penalty alternatives excluded from the selected routes.

All geometry remains **draft**, pending independent layout confirmation. OSM one-way order is retained on the additional venues except Valencia, whose selected counterclockwise order is provisional because direction tags are absent. Measured lengths describe the OSM trace, not a surveyed circuit length. Magny-Cours measures 4.46 km against the FIA nominal 4.411 km and retains an explicit note.

The private preview has 27 local start/finish references from the Racelogic timing XML. Each lies within 3.8 m of its selected trace. The original GPS centers are retained; generated 25 m endpoints are marked estimated. The archive is never used for track boundaries, CIR geometry or track maps. Public GeoJSON contains traces only and reports timing missing. Private timing is served separately and excluded from `dist/`.

## Validation

`npm run build` passes data validation, deterministic regeneration checks, TypeScript checks and the production bundle. Lint and four focused unit tests pass. Browser acceptance opens every catalogue layout, checks the selected trace and public download, exercises filters and deep links, and works with unavailable background tiles. Additional browser checks cover delayed switching and a mobile viewport.

Source snapshots and generated data are stored locally. Generation and the production build fetch no remote geometry. A built-file scan checks for private timing coordinates and local filesystem paths. The preview is available over Tailscale at [the Mac Mini preview](https://marks-mac-mini.baboon-trench.ts.net:8445/).

## Remaining original pilot requirements

This expansion does not complete the stricter `--pilot-ready` release gate:

- `de-nurburgring/grand-prix` currently shows the mapped Sprint configuration, not the full GP course.
- `de-nurburgring/nordschleife-btg` is absent.
- Anneau's `3-0-km` and `3-7-km` nominal associations need confirmation; their OSM traces measure 2.80 km and 3.47 km.
- Every original pilot route remains draft and lacks independently reusable, verified timing positions.

These limits remain visible in the viewer and source records. Software checks do not establish surveyed geometry, layout homologation or timing redistribution rights.
