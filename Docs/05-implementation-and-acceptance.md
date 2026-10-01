# Implementation plan and acceptance

## 1. Execution rules

Implement only the specified pilot. Keep code small. Add comments for non-obvious route traversal, geographic calculations, and stale-request prevention.

Read repository instructions before changes. Preserve unrelated work. Use one package and one lockfile. Choose a supported Node.js LTS and document it. Bind development, preview, and test servers to `0.0.0.0`.

The following commands are required interfaces for the future implementation. They do not exist yet in the specification-only repository.

## 2. Required commands

| Command | Expected behavior |
| --- | --- |
| `npm ci` | Install locked dependencies |
| `npm run dev -- --host 0.0.0.0` | Run the local viewer |
| `npm run import:osm -- --track <track-id>` | Reuse an existing valid snapshot; fetch only if absent |
| `npm run import:osm -- --track <track-id> --refresh` | Explicitly fetch and stage a new snapshot |
| `npm run generate:data` | Generate layout files and catalogue from local sources |
| `npm run generate:data -- --check` | Compare expected output with committed files; write nothing; fail on differences |
| `npm run validate:data` | Validate all public data and source references; report draft findings |
| `npm run validate:data -- --pilot-ready` | Also enforce the required pilot completeness |
| `npm run typecheck` | Type-check application and tooling |
| `npm run lint` | Check code quality without modifying files |
| `npm test` | Run deterministic unit and data tests |
| `npm run test:e2e` | Run browser acceptance tests against local static content |
| `npm run build` | Validate data, check generated files, and build `dist/`; no data refresh |
| `npm run preview -- --host 0.0.0.0` | Serve the production build locally |

Importer venue bounds can live in the venue's `import.json` or a small bootstrap config before its first snapshot. The importer must report which snapshot it reused. A refresh stages new data for review before replacing approved source inputs. Document the small explicit promotion procedure; do not add a background updater.

Commands that fail return a nonzero exit code and an actionable error. The normal build accepts valid draft records. `--pilot-ready` is the separate release-completeness gate.

## 3. Milestone A: repository and data contract

Implement:

1. Package configuration, lockfile, Node version, and ignored generated/private locations.
2. Shared schemas and types from document 02.
3. Synthetic fixtures for a closed circuit, a shared gate, separate gates, and missing timing.
4. Structural and semantic validation.
5. Deterministic catalogue generation.

Completion criteria:

- A valid fixture passes.
- Invalid coordinates, broken source references, invalid closure, and incompatible gate roles fail with field-level messages.
- Test fixtures are outside the public data tree.
- Repeated catalogue generation is byte-identical.

## 4. Milestone B: one OSM-derived venue

Start with Salzburgring.

1. Fetch or sanitize its public OSM snapshot.
2. Record source attribution and snapshot identity.
3. Implement explicit source-way slicing and route assembly.
4. Create the main-course recipe and review its traversal.
5. Generate its trace and length.
6. Research its timing position and preserve the actual result.

Completion criteria:

- The trace is reproducible without the network or reference files.
- Pit/training/area candidates are excluded with a review note.
- Broken source connectivity stops generation instead of drawing an invented join.
- Gate generation works with a synthetic verified point; the real record accurately reports available evidence.

Missing real timing evidence does not stop work on the viewer or the next venue. It remains a pilot-data blocker.

## 5. Milestone C: viewer

Implement the interface and behaviors in document 01.

Completion criteria:

- The catalogue, filters, venue selection, and layout selection work.
- The trace and gates render from static files.
- Status and source information are visible.
- GeoJSON download returns the selected public file unchanged.
- Same-page switching handles late responses and errors correctly.
- Query URLs, Back, Forward, and reload preserve the intended selection.
- The site works under both `/` and a non-root test base path.

## 6. Milestone D: multiple layouts and timing variants

Add the Anneau du Rhin and Nürburgring targets from document 04.

Completion criteria:

- Every obtainable target has its own reproducible recipe and review record.
- Anneau alternatives change the actual course geometry.
- Nürburgring GP and Nordschleife fit to their own geometry.
- BTG is an open timing variant, with separate independently sourced gates when verified.
- Missing targets and evidence are listed by exact ID.
- Adding a layout requires only data/source files, not venue-specific UI code.

## 7. Milestone E: acceptance and handoff

Run the required checks. Inspect the actual production build in a browser. Complete the pilot status report and contributor instructions.

Completion criteria:

- Type checks, lint, deterministic tests, browser tests, data checks, and production build pass.
- Public data can be regenerated with network access disabled.
- Built files contain only intended public assets and data.
- The implementation report distinguishes software completion from pilot-data completion.
- Any failed `--pilot-ready` check names the required missing evidence. It is not concealed by skipping the command.

## 8. Focused automated tests

Use the smallest suitable unit-test runner. Use Playwright or an equivalent real-browser runner for UI behavior. Keep tests about failure modes and behavior, not copies of configuration values.

### Route and data tests

| Case | Expected result |
| --- | --- |
| Forward and reverse slices | Correct node traversal order |
| Closed source way split across array boundary | One continuous route; no duplicate adjacent join point |
| Nearby unconnected ways | Assembly fails |
| Bridge crossing without shared node | No connection invented |
| Closed circuit | Exact closure retained; length includes closing segment |
| Open timing route | Endpoints coincide with gate intersections |
| BTG-style trimming across loop array boundary | Correct forward subsection; no full-loop duplicate |
| Missing timing | Valid draft data; no fabricated gate |
| Verified center with display endpoints | Perpendicular gate intersects selected edge; endpoint method preserved |
| Large gate projection displacement | Generation stops for review |
| Wrong source hash or version | Generation fails with affected recipe identified |
| Two generations from one snapshot | Identical output bytes |
| Stale generated file | `generate:data --check` fails without writing |

Use hand-checkable synthetic coordinates for geometry tests. Do not assert that all real lap lengths equal nominal circuit marketing lengths.

### Browser tests

| Case | Expected result |
| --- | --- |
| Open catalogue | One marker per listed venue; usable list |
| Search `nurburgring` | Finds `Nürburgring` |
| Country plus name filter | Intersection of both filters |
| Filter excludes current selection | Old route and gates removed |
| Switch layouts A -> B -> A | Correct trace, gates, details, and download each time |
| Rapid A -> B -> C with delayed responses | C remains selected after all responses finish |
| Switch to missing-gate fixture | Previous layout's gates disappear |
| Failed layout fetch | Visible error; no mismatched old geometry; retry works |
| Shared gate versus separate gates | Correct number, labels, and status |
| Deep link and reload | Same selection restored |
| Back and Forward | Previous selection restored without page navigation |
| Download | File IDs and features match selected layout |
| Tile requests fail | Vector display and controls remain usable |
| Mobile viewport and keyboard navigation | Controls usable; map and attribution visible |
| Non-root deployment base | Data, scripts, and styles load correctly |

Mock tile requests in automated tests. Avoid depending on live Overpass or external map availability. Use fixtures for error conditions and actual pilot files for at least one catalogue-to-layout end-to-end path.

## 9. Manual visual review

At desktop and mobile widths, inspect each available pilot layout in the production preview.

Confirm:

- The selected route follows its intended OSM course.
- There are no unexplained jumps, pit detours, or missing branches.
- Gates appear across the correct part of the route.
- Switching layouts removes the previous route and all of its gates.
- Missing and estimated timing information is clear.
- Map attribution is visible and not covered by the panel.
- Controls remain usable after a resize.

Record screenshots and a short result in the implementation report. Screenshot storage must contain only reusable public data. A screenshot alone does not replace route source review.

## 10. Contributor workflow for the next venue

Document this exact sequence in the implementation's contributor guide:

1. Choose country and stable venue ID; check for duplicates and aliases.
2. Add venue metadata and a source acquisition box.
3. Acquire and sanitize reusable source material.
4. Identify named layouts and travel direction from evidence.
5. Write one explicit recipe per supported layout.
6. Add independently sourced timing positions, or mark them missing.
7. Generate, validate, and review the data on the map.
8. Inspect changed geometry, source attribution, and rights evidence.
9. Update the catalogue through generation and run checks.
10. Submit the metadata, recipes, public evidence, generated layouts, and review notes together.

Expand one venue at a time. A global discovery crawler, full reference inventory importer, and unattended layout inference are separate future work.

## 11. Required implementation deliverables

- Working static website and reproducible production build.
- Public catalogue and available pilot geometry files.
- Source snapshots, route recipes, and review records.
- Shared schemas, importer, generator, and validator.
- Automated tests covering the specified failure cases.
- Root README with setup commands, scope, licenses, and pilot status.
- Contributor guide with the next-venue process.
- A concise implementation report with commands run, results, and remaining data blockers.

Keep this specification linked from the root README. Do not duplicate the entire package into `AGENTS.md` or `CLAUDE.md`. If agent entry files are useful, make them short pointers to this package and the repository commands.

## 12. Deliberately deferred work

Revisit these only after the maintainer requests them: more pilot venues, sector lines, pit geometry, historical configurations, crowdsourced browser editing, automated venue discovery, database APIs, telemetry imports, racing lines, and production deployment automation.

The first release succeeds when contributors can add trustworthy route files and visitors can inspect them simply.
