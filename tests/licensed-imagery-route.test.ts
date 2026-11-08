import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { licensedImageryCoordinates, licensedImageryRouteSchema, buildLicensedImageryRoute } from '../scripts/licensed-imagery-route';
import { validateLayout, validateTrack } from '../schemas/data';
import { assemble } from '../scripts/route';
import { traceCredit } from '../src/trace-credit';
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const root = 'sources/in-kari-motor-speedway-191172211', base = 'data/india/kari-motor-speedway-191172211';
const recipe = json(root + '/layouts/main.json'), source = json(root + '/kari-main-image-route.json'), track = validateTrack(json(base + '/track.json'));

test('licensed source reconstructs the corrected Kari trace with its own rights and no raster or timing dependency', () => {
 const layout = buildLicensedImageryRoute(recipe, source, track), saved = json(base + '/layouts/main.geojson');
 assert.deepEqual(saved.features.find((f: { properties: { role: string } }) => f.properties.role === 'trace'), layout.features[0]);
 assert.equal(layout.metadata.license, source.imagery.license);
 assert.equal(layout.metadata.timing, undefined);
 assert.equal(createHash('sha256').update(readFileSync(root + '/kari-main-image-route.json')).digest('hex'), recipe.snapshotSha256);
 assert.ok(traceCredit(layout).startsWith('Trace © MapTiler'));
 assert.ok(traceCredit(layout).includes('LicenseRef-MapTiler-Derived-Borders'));
 const proof = json('sources/research/kari-main-route-review.json'), oldWays = json(root + '/osm.json').elements;
 assert.deepEqual(assemble(oldWays, proof.original.recipe.segments, true), proof.original.layout.features[0].geometry.coordinates);
 assert.notDeepEqual(layout.features[0].geometry, proof.original.layout.features[0].geometry);
});

test('licensed source refuses mismatched georeferencing, unknown rights, credentials and invalid source paths', () => {
 const bad = (change: (d: typeof source) => void) => { const d = structuredClone(source); change(d); assert.throws(() => licensedImageryCoordinates(d)); };
 bad(d => { delete d.imagery.rightsBasis; });
 bad(d => { d.imagery.sha256 = '0'.repeat(64); });
 bad(d => { d.imagery.url += '?key=do-not-store-credentials'; });
 bad(d => { d.imagery.url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'; });
 bad(d => { d.imagery.width += 1; });
 bad(d => { d.imagery.groundPixelSizeM *= 0.9; });
 bad(d => { d.imagery.extent3857[0] += 1; });
 bad(d => { d.pixels[1] = [-1, 0]; });
 bad(d => { d.pixels[1] = [d.imagery.width, 0]; });
 bad(d => { d.pixels[1] = d.pixels[0]; });
 bad(d => { d.pixels[d.pixels.length - 1][0] += 1; });
 bad(d => { d.pixels = [[1300,470],[1320,490],[1300,490],[1320,470],[1300,470]]; });
 assert.equal(licensedImageryRouteSchema.safeParse({ ...source, imageryFile: 'unlicensed-raster.png' }).success, false);
});

test('licensed trace cannot be relabelled as ODbL, detached from its source, or given unlicensed timing', () => {
 const built = buildLicensedImageryRoute(recipe, source, track), mislabeled = structuredClone(built);
 mislabeled.metadata.license = 'ODbL-1.0';
 assert.throws(() => validateLayout(mislabeled, track, 'main'), /cannot be declared ODbL/);
 const wrongTrack = structuredClone(track); wrongTrack.sources = wrongTrack.sources.filter(s => s.id !== source.sourceId);
 assert.throws(() => buildLicensedImageryRoute(recipe, source, wrongTrack), /rights are not registered/);
 assert.throws(() => buildLicensedImageryRoute({ ...recipe, gates: [{}] }, source, track), /timing mismatch/);
});
