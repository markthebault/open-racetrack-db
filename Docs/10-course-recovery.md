# Independent course recovery

The catalogue now has draft traces for **873 of 1,007 entries**. This recovery adds 416 associations: 374 newly generated course traces and 42 associations to existing venue-level traces. The latter remove redundant empty entries rather than duplicate their coordinates. All eight Paul Ricard catalogue entries have traces. The manual review adds 320 traces across 46 countries. 288 explicit configuration choices, including four reassessed existing traces, are recorded in the [selection manifest](../sources/reference/course-selections.json). A further 36 aggregate configurations are recorded in the [network selection manifest](../sources/reference/course-network-selections.json). Their independently identified branches remain separate paths, and shared edges count once. Layout diagrams identify branch choices only; no image coordinates are extracted or copied.

Course geometry remains independent OSM data. Published event and operator documents identify specific configurations; they do not supply coordinates. Source snapshots are sanitized and hash-pinned, and every route recipe references exact source ways, versions and node indices. Private timing positions help identify a course and remain outside public downloads.

The route search now covers road circuits longer than 30 km and focuses complex graphs around timing and course-distance checks. A step or depth limit marks a search incomplete. It cannot establish uniqueness. Named circuit relations add street roads that the country raceway extracts omit. Open-course imports retain separate endpoints and never create closing connectors.

The following source limitations remain after the complete search of the pinned country extracts. Counts describe unfinished work, not completed layouts. The [machine-readable list](../data/layout-gap-research.json) identifies every affected entry, independent source ways where available, and its next step.

| Remaining cause | Entries |
| --- | ---: |
| Ambiguous source branches | 19 |
| Unresolved course-distance discrepancy | 42 |
| Independent geometry absent near the timing position | 53 |
| Aggregate configuration needs identification | 5 |
| Open-course route or endpoint evidence needed | 8 |
| Source connectivity incomplete | 7 |
| Bounded search incomplete | 0 |
| **Total** | **134** |

No new conservative, uniquely distinguished cycle remains unregistered in these country extracts. That does not prove there is no suitable geometry elsewhere. Independent circuit documents, licensed GPS surveys or more complete public mapping are needed to resolve the remaining cases. “Draft trace” means a route hypothesis requiring review; it does not certify every branch or historical configuration.

## Archive filename reconciliation

The [separate filename inventory](../sources/reference/archive-inventory.json) checks all 1,041 course-file names without importing their geometry. Six alternate filenames are now reconciled by the [reviewed alias manifest](../sources/reference/archive-name-reconciliation.json): a selected canonical name and identical complete-file fingerprints are required. No course-data sections are parsed. Eighteen names remain without a reconciled match in the 1,007-record timing XML; three other entries have country-folder aliases and five sit outside country folders. Some remaining names may be legacy aliases, while others may represent additional configurations. Filename similarity alone cannot prove their timing or geometry equivalence. They remain an additional inventory reconciliation task, beyond the 134 registered timing-entry trace gaps.

## Reproduce the research

Use the commands in the [README](../README.md#layout-completeness). Circuit discovery reuses its pinned snapshot unless `--refresh` is explicitly supplied. Relation research caches full source responses locally. Recovery runs serially before regenerating data, auditing coverage, importing private timing and publishing the preview.

The gap search reads the supplied timing XML, checks the independent country snapshot hashes, and outputs names, source references and failure categories. It does not publish timing coordinates, import archive geometry or add synthetic links. The importer can add a named open road course only when the source is a complete unbranched chain and both private timing positions agree with its existing endpoints.

The Moscow general entry includes separately selectable Grand Prix 1, Grand Prix 2, Grand Prix 5, FIM, Sprint 1 and Supersprint configurations identified from the operator highlighted plans. Their exact independent node routes retain the measured distances and exclude parallel pit routes. Highlands, Inde and Reno Fernley aggregate entries now group existing component recipes that were registered under other venue entries. Parent snapshot hashes and branch choices are preserved; duplicate paths are removed from the networks. These aggregates remain draft configuration networks.

Estering now has operator-identified Standard and Joker laps, plus an aggregate network. Knysna, St-Ursanne and Virginia City use independently mapped open road courses with separate endpoints. Their selection notes preserve course-distance discrepancies and distinguish timing extents from current event descriptions.

KIP and Fatima now use independently identified full-course routes, with catalogue distance discrepancies preserved. Drakon uses its pinned 2024 course rather than the later extension. Montalegre and Lousada general entries group their historical Standard and Joker laps from consistent 2020 source snapshots. Andalucia retains the two catalogue branch choices rather than substituting the contemporary northern bypass. Apex I groups the operator-identified southern straight and chicane with the full northern spiral; the separate inner Fast shortcut is excluded. Fourteen targeted browser checks verify these additions and downloads.

Goodwood Kartways now groups the operator Standard Long and Long with Chicane routes. G2 Combined follows the independently closed full course; the shorter West closure remains unverified. Adelaide and the TT course use existing public junction nodes without invented connectors. Charlotte Full follows the main oval, and its ROVAL draft retains the earlier infield and both 2018 chicanes from one consistent snapshot.

Charleston Peak North and Spring Mountain East A, Lauda B and Lauda C follow the operator highlighted plans. The general Spring Mountain entry groups its published West and North/South variants as separate paths. Groß Dölln follows the organizer A+B+C plan. Gelleråsen uses the earlier full main course, excluding pit access and later kart extensions. Pocono follows the operator North/South Option 1; its independent course distance is retained separately. Seven targeted browser checks passed for the first individual course additions in this batch.
