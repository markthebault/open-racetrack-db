# European coverage — 2026-09-30

The catalogue has 161 venues and 170 draft traces in 25 countries. This adds 143 venues to the earlier 18-venue preview. All 46 configured country extracts were fetched and hash-pinned. This is acquisition coverage, not proof that every European circuit or named layout is present.

## Scope and evidence

The target is permanent car and motorcycle road circuits throughout Europe, including the UK, Norway, Switzerland and the Balkans. Karting and motocross are excluded. Current acquisition includes Cyprus, all of Turkey, and Russia west of 60° E, between 34° and 72° N; country extracts also include overseas islands. These are declared acquisition bounds, not a claim of a strict continental boundary. The Vatican has no acquisition entry. Street-event circuits such as Monaco and Norisring are outside this permanent-circuit scope.

Only pinned OSM raceway ways supply trace coordinates. Facility polygons identify venues but never become course traces. Exact source node identities connect ordered way slices; proximity cannot close a gap. Recipes retain way versions and snapshot hashes. No Racelogic CIR, track boundary, or map image is read. The private archive supplies only start/finish GPS and layout names.

Country discovery excludes explicit karting, motocross, pit lanes, areas, abandoned/disused ways and unpaved sections. A curated name classifier retains potential road circuits; this is a classification hint, not evidence that a facility is currently operating. Historical or closed facilities can remain draft until their operating status is checked. Named closed raceways are preferred; otherwise a bounded search selects a connected cycle. Unknown travel direction and configuration remain stated in each recipe and source review. A longest source cycle can combine alternative branches; it must not be relabelled as a verified GP layout.

## Remaining work

The inventory has 873 pending candidate groups or facilities. These include unnamed loops and out-of-scope facilities, so 873 is not a count of missing road circuits. Another 3,185 eligible source groups did not produce a closed cycle of at least 1 km. These can be open fragments, service ways, short courses or incomplete mapping. Short courses need manual recipes and are not excluded from the project's intended scope.

Brno, Navarra, Lausitzring and Porsche Leipzig have identity-only leads from the [FIA list updated 2026-03-31](https://www.fia.com/sites/default/files/circuits_fia20260331_0.pdf). No coordinates are copied from that reference. Balaton Park and KymiRing have OSM facility identities but no selected eligible closed road trace. Kirkistown's branching requires an explicit route choice. The list is not exhaustive; country results with zero published venues do not prove that the country has no circuits.

All published geometry remains draft; public timing evidence is missing. The local timing importer may match an archive GPS point within 20 m of a new course. That association is labelled proximity-only and unverified. Display gates keep the original GPS center, use estimated 25 m endpoints, and stay outside public builds, downloads and screenshots. A nearby timing point does not verify the selected configuration.

The original pilot gaps remain documented in [the earlier implementation report](06-european-preview-status.md): Anneau layout lengths, the full Nürburgring GP course, and Bridge to Gantry evidence are unresolved. Neither pilot completion nor complete European data coverage is claimed.

## Country inventory

Pending counts are source candidates requiring review. Open/short counts refer to eligible connected source groups without an accepted closed cycle, not venue totals.

| Country extract | Published venues | Pending candidates | Open/short groups |
| --- | ---: | ---: | ---: |
| United Kingdom | 21 | 54 | 231 |
| France | 37 | 76 | 397 |
| Germany | 6 | 70 | 299 |
| Italy | 19 | 91 | 327 |
| Spain | 20 | 77 | 292 |
| Austria | 2 | 11 | 63 |
| Belgium | 2 | 5 | 28 |
| Netherlands | 2 | 13 | 74 |
| Portugal | 4 | 13 | 42 |
| Ireland | 1 | 2 | 18 |
| Sweden | 8 | 62 | 251 |
| Norway | 3 | 46 | 155 |
| Finland | 8 | 28 | 130 |
| Denmark | 4 | 4 | 98 |
| Iceland | 0 | 3 | 6 |
| Poland | 3 | 31 | 95 |
| Czechia | 3 | 22 | 53 |
| Slovakia | 1 | 6 | 26 |
| Hungary | 3 | 14 | 31 |
| Romania | 2 | 6 | 8 |
| Bulgaria | 0 | 9 | 19 |
| Croatia | 1 | 5 | 16 |
| Slovenia | 0 | 2 | 10 |
| Serbia | 0 | 2 | 4 |
| Bosnia and Herzegovina | 0 | 3 | 0 |
| Montenegro | 0 | 0 | 1 |
| Albania | 0 | 0 | 0 |
| North Macedonia | 0 | 2 | 0 |
| Greece | 2 | 12 | 58 |
| Estonia | 1 | 11 | 34 |
| Latvia | 0 | 21 | 37 |
| Lithuania | 1 | 17 | 11 |
| Switzerland | 0 | 3 | 33 |
| Luxembourg | 0 | 1 | 9 |
| Liechtenstein | 0 | 0 | 0 |
| Andorra | 0 | 0 | 2 |
| Monaco | 0 | 0 | 6 |
| San Marino | 0 | 1 | 2 |
| Malta | 0 | 0 | 3 |
| Cyprus | 0 | 2 | 4 |
| Türkiye | 1 | 4 | 17 |
| Russia | 6 | 118 | 195 |
| Ukraine | 0 | 22 | 71 |
| Belarus | 0 | 4 | 26 |
| Moldova | 0 | 0 | 2 |
| Kosovo | 0 | 0 | 1 |

## Reproduce and review

`npm run discover:europe` fetches country data serially and resumes cached extracts. `npm run expand:europe` builds draft metadata, recipes and the review inventory offline. Existing catalogue routes are retained. `npm run generate:data` regenerates GeoJSON and the catalogue. Import snapshots are immutable by default; intentionally refreshing a country requires retaining the prior extract and reviewing changed selections.

`data/europe-coverage.json` contains country acquisition status, hashes, excluded-way counts, unresolved source groups and named facilities. `sources/europe/bootstrap.json` records added venue acquisition boxes. `sources/<venue>/review.md` links the exact source ways and records unresolved configuration evidence.

Validation checks source hashes, exact route joins and versions, generated-data reproducibility, schema consistency and inventory references. Browser checks open every published layout, download its public trace, exercise filtering and stale requests, and verify mobile controls. Those checks establish software behavior and source topology; they do not establish real-world layout correctness, operating status, direction or timing rights.
