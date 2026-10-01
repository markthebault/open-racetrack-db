# Independent course recovery

The catalogue now has draft traces for **801 of 1,007 entries**. This recovery adds 344 associations: 302 newly generated course traces and 42 associations to existing venue-level traces. The latter remove redundant empty entries rather than duplicate their coordinates. All eight Paul Ricard catalogue entries have traces. The manual review adds 248 traces across 40 countries. 232 explicit configuration choices, including two reassessed existing traces, are recorded in the [selection manifest](../sources/reference/course-selections.json). A further 18 aggregate configurations are recorded in the [network selection manifest](../sources/reference/course-network-selections.json). Their independently identified branches remain separate paths, and shared edges count once. Layout diagrams identify branch choices only; no image coordinates are extracted or copied.

Course geometry remains independent OSM data. Published event and operator documents identify specific configurations; they do not supply coordinates. Source snapshots are sanitized and hash-pinned, and every route recipe references exact source ways, versions and node indices. Private timing positions help identify a course and remain outside public downloads.

The route search now covers road circuits longer than 30 km and focuses complex graphs around timing and course-distance checks. A step or depth limit marks a search incomplete. It cannot establish uniqueness. Named circuit relations add street roads that the country raceway extracts omit. Open-course imports retain separate endpoints and never create closing connectors.

The following source limitations remain after the complete search of the pinned country extracts. Counts describe unfinished work, not completed layouts. The [machine-readable list](../data/layout-gap-research.json) identifies every affected entry, independent source ways where available, and its next step.

| Remaining cause | Entries |
| --- | ---: |
| Ambiguous source branches | 35 |
| Unresolved course-distance discrepancy | 72 |
| Independent geometry absent near the timing position | 68 |
| Aggregate configuration needs identification | 13 |
| Open-course route or endpoint evidence needed | 11 |
| Source connectivity incomplete | 7 |
| Bounded search incomplete | 0 |
| **Total** | **206** |

No new conservative, uniquely distinguished cycle remains unregistered in these country extracts. That does not prove there is no suitable geometry elsewhere. Independent circuit documents, licensed GPS surveys or more complete public mapping are needed to resolve the remaining cases. “Draft trace” means a route hypothesis requiring review; it does not certify every branch or historical configuration.

## Archive filename reconciliation

The [separate filename inventory](../sources/reference/archive-inventory.json) checks all 1,041 course-file names without importing their geometry. Twenty-four names have no normalized name match in the 1,007-record timing XML; three have country-folder aliases and five sit outside country folders. Some unmatched names may be legacy aliases, while others may represent additional configurations. Filename similarity alone cannot prove their timing or geometry equivalence. They remain an additional inventory reconciliation task, beyond the 206 registered timing-entry trace gaps.

## Reproduce the research

Use the commands in the [README](../README.md#layout-completeness). Circuit discovery reuses its pinned snapshot unless `--refresh` is explicitly supplied. Relation research caches full source responses locally. Recovery runs serially before regenerating data, auditing coverage, importing private timing and publishing the preview.

The gap search reads the supplied timing XML, checks the independent country snapshot hashes, and outputs names, source references and failure categories. It does not publish timing coordinates, import archive geometry or add synthetic links. The importer can add a named open road course only when the source is a complete unbranched chain and both private timing positions agree with its existing endpoints.
