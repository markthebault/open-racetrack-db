# Open Racetrack Database: implementation specification

Specification version: 0.1  
Date: 2026-09-30  
Status: ready for implementation; pilot source research is incomplete.

The original pilot specification below records the initial scope. The implemented worldwide viewer and the 2026-10-04 UI and terrain extension are described in the root [README](../README.md) and [11-atlas-and-elevation.md](11-atlas-and-elevation.md). The maintainer explicitly requested the 3D elevation extension; it supersedes the original exclusion of elevation profiles.

## Purpose

Build a public database of racetracks and a small map viewer. Store the data in static files. Organize it by country, venue, and layout. Show each layout on an OpenStreetMap background with its start and finish lines.

The first release covers three venues: Salzburgring, Anneau du Rhin, and Nürburgring. It must demonstrate multiple layouts at one venue. The project can then add more venues through the same data process.

This package specifies work for a later implementation agent. Creating this package does not implement or deploy the application.

## Read order and authority

Read all six documents before implementation. Use these boundaries when a detail needs clarification.

| Document | Authoritative subject |
| --- | --- |
| [01-product-and-viewer.md](01-product-and-viewer.md) | Product scope, interface, runtime behavior, technical choices |
| [02-data-contract.md](02-data-contract.md) | File structure, fields, geometry, validation rules |
| [03-sourcing-and-import.md](03-sourcing-and-import.md) | Source rights, OSM extraction, layout recipes, timing evidence |
| [04-pilot-venues.md](04-pilot-venues.md) | Initial venues, target layouts, research leads, known gaps |
| [05-implementation-and-acceptance.md](05-implementation-and-acceptance.md) | Work order, commands, tests, completion criteria |

In this package, MUST means required. SHOULD means the default; document a reason for an exception. MAY means optional. A research lead is not verified data. Synthetic examples explain the format and must stay in test fixtures.

When a source fact conflicts with a planned layout, preserve the evidence and report the conflict. Do not change geometry to make an expected name or length appear correct.

## Fixed decisions

- Use static JSON and GeoJSON as the public database.
- Use country folders, then venue folders, then layout files.
- Use OSM raceway geometry as the initial trace source.
- Assemble named layouts through explicit, reviewed routes.
- Use a small TypeScript, Vite, and Leaflet website.
- Use npm and a committed lockfile.
- Use one source language for the viewer and import tools: TypeScript.
- Use local data at runtime. Fetch map tiles from a configured provider.
- Use MIT for original application code. Plan ODbL 1.0 for the OSM-derived database, subject to the source rules.
- Keep data rights and software licensing separate.
- Keep the first release to the pilot in document 04.

## Scope boundary

Include venue browsing, layout selection, trace display, start/finish display, source information, and GeoJSON download.

Exclude racing lines, lap timing, telemetry, sectors, speed simulation, autonomous driving, track widths, elevation profiles, corner databases, pit lane display, accounts, online editing, and a server database. A drawn timing line supports map display. It does not certify a lap-timing system.

Do not import the existing reference traces or timing coordinates into public data without documented reuse permission. Use independently reusable sources for the initial public dataset. The full rule and permitted local comparison process are in document 03.

## Completion has two separate results

1. **Software complete:** the viewer, import process, validation, tests, and documentation meet document 05. Missing real-world evidence does not prevent software completion.
2. **Pilot complete:** every required layout in document 04 has reviewed geometry and verified timing positions from reusable sources. Estimated display gate endpoints are allowed when clearly identified.

A pilot can remain partly blocked after the software is complete. Report those missing facts by layout. Do not claim the full project is complete while required pilot evidence is missing. Publicly reusable draft geometry may be displayed with an explicit status.

## Handoff prompt

An implementation agent can start with this prompt:

> Read `Docs/README.md` and all five linked specifications. Implement the static racetrack database and viewer in this repository. Follow the fixed scope and the milestone order. Start with the three pilot venues. Keep every public coordinate traceable to a reusable source. Use draft states for unresolved facts. Complete the required tests and report software completion separately from pilot-data completion. Bind local services to `0.0.0.0`. Do not deploy, publish, or import proprietary data as part of this local implementation task.

Routine implementation decisions belong to the agent. Ask the maintainer only when source permission, a material scope change, or unresolved venue identity requires a decision.
