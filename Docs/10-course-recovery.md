# Independent course recovery

The catalogue now has draft traces for **895 of 1,007 entries**. This recovery adds 438 associations: 396 newly generated course traces and 42 associations to existing venue-level traces. The latter remove redundant empty entries rather than duplicate their coordinates. All eight Paul Ricard catalogue entries have traces. The manual review adds 342 traces across 46 countries. 301 explicit configuration choices, including four reassessed existing traces, are recorded in the [selection manifest](../sources/reference/course-selections.json). A further 40 aggregate configurations are recorded in the [network selection manifest](../sources/reference/course-network-selections.json). Their independently identified branches remain separate paths, and shared edges count once. Layout diagrams identify branch choices only; no image coordinates are extracted or copied.

Course geometry comes from independent OSM data or public-domain georeferenced aerial imagery. Published event and operator documents identify specific configurations; they do not supply coordinates. OSM snapshots are sanitized and hash-pinned, with exact source ways, versions and node indices. Imagery recipes preserve the source raster, export extent, pixel vertices and both hashes. Private timing positions help identify a course and remain outside public downloads.

The route search now covers road circuits longer than 30 km and focuses complex graphs around timing and course-distance checks. A step or depth limit marks a search incomplete. It cannot establish uniqueness. Named circuit relations add street roads that the country raceway extracts omit. Open-course imports retain separate endpoints and never create closing connectors.

The following source limitations remain after the complete search of the pinned country extracts. Counts describe unfinished work, not completed layouts. The [machine-readable list](../data/layout-gap-research.json) identifies every affected entry, independent source ways where available, and its next step.

| Remaining cause | Entries |
| --- | ---: |
| Ambiguous source branches | 14 |
| Unresolved course-distance discrepancy | 33 |
| Independent geometry absent near the timing position | 46 |
| Aggregate configuration needs identification | 5 |
| Open-course route or endpoint evidence needed | 8 |
| Source connectivity incomplete | 6 |
| Bounded search incomplete | 0 |
| **Total** | **112** |

No new conservative, uniquely distinguished cycle remains unregistered in these country extracts. That does not prove there is no suitable geometry elsewhere. Independent circuit documents, licensed GPS surveys or more complete public mapping are needed to resolve the remaining cases. “Draft trace” means a route hypothesis requiring review; it does not certify every branch or historical configuration.

## Archive filename reconciliation

The [separate filename inventory](../sources/reference/archive-inventory.json) checks all 1,041 course-file names without importing their geometry. Six alternate filenames are now reconciled by the [reviewed alias manifest](../sources/reference/archive-name-reconciliation.json): a selected canonical name and identical complete-file fingerprints are required. No course-data sections are parsed. Eighteen names remain without a reconciled match in the 1,007-record timing XML; three other entries have country-folder aliases and five sit outside country folders. Some remaining names may be legacy aliases, while others may represent additional configurations. Filename similarity alone cannot prove their timing or geometry equivalence. They remain an additional inventory reconciliation task, beyond the 112 registered timing-entry trace gaps.

## Reproduce the research

Use the commands in the [README](../README.md#layout-completeness). Circuit discovery reuses its pinned snapshot unless `--refresh` is explicitly supplied. Relation research caches full source responses locally. Recovery runs serially before regenerating data, auditing coverage, importing private timing and publishing the preview.

The gap search reads the supplied timing XML, checks the independent country snapshot hashes, and outputs names, source references and failure categories. It does not publish timing coordinates, import archive geometry or add synthetic links. The importer can add a named open road course only when the source is a complete unbranched chain and both private timing positions agree with its existing endpoints.

The Moscow general entry includes separately selectable Grand Prix 1, Grand Prix 2, Grand Prix 5, FIM, Sprint 1 and Supersprint configurations identified from the operator highlighted plans. Their exact independent node routes retain the measured distances and exclude parallel pit routes. Highlands, Inde and Reno Fernley aggregate entries now group existing component recipes that were registered under other venue entries. Parent snapshot hashes and branch choices are preserved; duplicate paths are removed from the networks. These aggregates remain draft configuration networks.

Estering now has operator-identified Standard and Joker laps, plus an aggregate network. Knysna, St-Ursanne and Virginia City use independently mapped open road courses with separate endpoints. Their selection notes preserve course-distance discrepancies and distinguish timing extents from current event descriptions.

KIP and Fatima now use independently identified full-course routes, with catalogue distance discrepancies preserved. Drakon uses its pinned 2024 course rather than the later extension. Montalegre and Lousada general entries group their historical Standard and Joker laps from consistent 2020 source snapshots. Andalucia retains the two catalogue branch choices rather than substituting the contemporary northern bypass. Apex I groups the operator-identified southern straight and chicane with the full northern spiral; the separate inner Fast shortcut is excluded. Fourteen targeted browser checks verify these additions and downloads.

Goodwood Kartways now groups the operator Standard Long and Long with Chicane routes. G2 Combined follows the independently closed full course; the shorter West closure remains unverified. Adelaide and the TT course use existing public junction nodes without invented connectors. Charlotte Full follows the main oval, and its ROVAL draft retains the earlier infield and both 2018 chicanes from one consistent snapshot.

Charleston Peak North and Spring Mountain East A, Lauda B and Lauda C follow the operator highlighted plans. The general Spring Mountain entry groups its published West and North/South variants as separate paths. Groß Dölln follows the organizer A+B+C plan. Gelleråsen uses the earlier full main course, excluding pit access and later kart extensions. Pocono follows the operator North/South Option 1; its independent course distance is retained separately. Seven targeted browser checks passed for the first individual course additions in this batch.

The two Bombarral entries now follow independently mapped 1B and 2B configurations identified by the operator and federation plans. The Motorplex trace retains both southern hairpins and the northern dogleg, excluding unpaved and staging alternatives. Toronto follows the event road sequence. Bedford GT retains the operator-identified outer branches; its 5255.1 m public mapped distance differs materially from the 5906 m timing scalar and advertised 6.11 km, and remains explicitly provisional. Five browser checks verify rendered closed lines and downloadable routes for this batch.

Alès now groups the technical course, independent north and south loops and direct central connection shown in the operator plan. The general entry excludes the inner northern shortcut, southern bypass and pit roads because they are absent from its branch identity. Mação groups independently mapped standard and joker laps identified from the federation plan. Rosario retains older extended and intermediate branches from the 2020 public snapshot, while its short course uses the 2013 main straight before a later pit-entry detour. Both extended names remain separately selectable; their small recorded difference is unrepresented and remains an alignment-review limitation. Sendai Highland uses its full 2013 public course, excluding pit access and drag-strip alternatives. Thirteen targeted browser checks passed for the 885-entry batch.

Homebush follows the full operator street sequence through Olympic Boulevard, Herb Elliot Avenue, Park Street and Murray Rose Avenue, excluding similar-length shortcuts. Temporary barrier and carriageway alignment remain draft. Fourteen browser checks passed for the 886-entry batch.

New York Safety Track now has a centerline independently digitized from public-domain 2019 NAIP imagery. Its complete paved course excludes pit entry and paddock driveways. The pinned image and 136 pixel vertices reproduce a 3141.9 m draft route without OSM or comparison-course coordinates. The operator's advertised distance differs; geometry is not scaled to match it. The imagery import and generation path preserves its own USGS/USDA attribution, checks source and raster hashes, and rejects vertices outside the raster or widely spaced joins. The imagery checks also verify the actual PNG dimensions against its georeferencing. All 42 unit tests passed.

Dixon now follows the complete paved Kinsmen kart course, excluding its inner diagonal shortcut and nearby dirt oval. Buttonwillow follows the operator Kart #1 configuration, including its three inner hairpins and eastern triangular return, excluding the surrounding main road circuit. Both draft centerlines use pinned public-domain 2022 NAIP imagery. Their measured lengths remain unscaled.

All nine browser tests passed for the 889-entry batch. The exhaustive check traversed every venue and selectable layout with background tiles unavailable, checking geometry availability, rendered traces and downloads.

Géoparc Long and Short now retain the independently mapped curved central return and southern infield crossing variants. Long also retains the far northern extension and central direct return; Short excludes both. The operator modular-course and karting plan identifies the component branches. Six additional source routes expose these branch choices separately. Nine venue browser checks pass. The source search now splits repeated junctions within the same way, recovering routes it previously hid; all 43 unit tests pass.

Bunny Loop now follows the narrow two-straight TRC Ohio test loop from pinned public-domain 2023 NAIP imagery. Both turnarounds are retained; the large high-speed oval and adjacent handling roads are excluded. The 2260.2 m centerline is unscaled, with turnaround alignment and direction still draft.

Road America Short follows the independently mapped back-half course through Turns 5–13 and its internal return before Turn 14. The operator fan map identifies the corners and return road. Its 3498.6 m distance remains unscaled against the 3450 m catalogue scalar; historical barriers and service-road alignment remain draft. A targeted browser check passed.

Sonoma Kart retains the full northern hairpin, middle return and southern chicane, excluding the diagonal shortcut and separate northern extension. Its 1197.8 m independently mapped draft differs from the 1103 m catalogue scalar. Thermal Twin Palms Short combines the middle Desert course with the South Palm outer loop, excluding the northern extension and southern inner technical loop. Its 3904.7 m centerline comes from pinned public-domain 2022 NAIP imagery. Both targeted browser checks passed.
