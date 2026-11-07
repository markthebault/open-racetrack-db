import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { borderPairHash } from "../scripts/refine-image-borders";
import { imageCrossSections } from "../scripts/infer-image-borders";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

test("a failed offline refresh preserves the existing borders and playable model byte for byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "track-refresh-"));
  try {
    const index = JSON.parse(await readFile("data/index.json", "utf8")),
      entry = index.tracks.find(
        (r: { id: string }) =>
          r.id === "ar-autodromo-ciudad-de-concepcion-del-uruguay-252762414",
      );
    index.tracks = [entry];
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(join(root, "data/index.json"), JSON.stringify(index));
    const trackPath = "data/" + entry.file,
      trackBytes = await readFile(trackPath),
      track = JSON.parse(trackBytes.toString()),
      item = track.layouts.find((r: { id: string }) => r.id === "main"),
      layoutPath = join(dirname(trackPath), item.file),
      original = await readFile(layoutPath),
      layout = JSON.parse(original.toString());
    await mkdir(dirname(join(root, layoutPath)), { recursive: true });
    await writeFile(join(root, trackPath), trackBytes);
    await writeFile(join(root, layoutPath), original);
    const image = {
        ...layout.metadata.borderInference.imagery,
        sha256: "0".repeat(64),
      },
      pin = join(root, "image.json");
    await writeFile(pin, JSON.stringify(image));
    await writeFile(join(root, "image.png"), "corrupt raster");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        resolve("node_modules/tsx/dist/loader.mjs"),
        resolve("scripts/infer-borders.ts"),
        "--track",
        entry.id,
        "--layout",
        "main",
        "--refresh",
        "--write",
        "--cached-image",
        pin,
        "--licensed-imagery",
      ],
      { cwd: root, encoding: "utf8", timeout: 20000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /retained-estimate/);
    assert.deepEqual(await readFile(join(root, layoutPath)), original);
    assert.deepEqual(await readFile(join(root, trackPath)), trackBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("original-border correction preserves failed attempts and commits only complete valid measurements", async () => {
  const root = await mkdtemp(join(tmpdir(), "track-original-correction-"));
  try {
    const index = JSON.parse(await readFile("data/index.json", "utf8"));
    const entry = index.tracks.find((r: { id: string }) => r.id === "se-sviestad-f8832c27");
    index.tracks = [entry];
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(join(root, "data/index.json"), JSON.stringify(index));
    const trackPath = "data/" + entry.file, trackBytes = await readFile(trackPath), track = JSON.parse(trackBytes.toString());
    const layoutPath = join(dirname(trackPath), track.layouts[0].file);
    const original = await readFile(layoutPath), layout = JSON.parse(original.toString());
    // Use an original-border fixture even after the real layout is corrected.
    delete layout.metadata.borderInference;
    const bytes = Buffer.from(JSON.stringify(layout));
    await mkdir(dirname(join(root, layoutPath)), { recursive: true });
    await writeFile(join(root, trackPath), trackBytes);
    await writeFile(join(root, layoutPath), bytes);
    const hash = borderPairHash(Object.fromEntries(layout.features.filter((f: { properties: { role: string } }) => ["inner", "outer"].includes(f.properties.role)).map((f: { properties: { role: string }; geometry: { coordinates: [number, number][] } }) => [f.properties.role, f.geometry.coordinates])) as { inner: [number, number][]; outer: [number, number][] });
    const pin = join(root, "image.json");
    await writeFile(pin, JSON.stringify({ sourceId: "test-pinned-image", url: "https://example.org/image", reuseEvidenceUrl: "https://example.org/rights", license: "public-domain", attribution: "Synthetic test fixture", retrievedAt: "2026-01-01T00:00:00Z", sha256: "0".repeat(64), width: 100, height: 100, extent3857: [0, 0, 100, 100], groundPixelSizeM: 1 }));
    await writeFile(join(root, "image.png"), "corrupt raster");
    const measurements = join(root, "measurements.json");
    await writeFile(measurements, JSON.stringify({ method: "cross-section-image-anchors-v1", imageSha256: "0".repeat(64), note: "Synthetic complete-measurement request for failure preservation.", patches: ["inner", "outer"].map((edge) => ({ edge, anchors: [0, 1].map((station) => ({ station, kind: "image-measured", coordinate: [0, station / 1000] })) })) }));
    const args = ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("scripts/infer-borders.ts"), "--track", entry.id, "--layout", track.layouts[0].id, "--write", "--cached-image", pin, "--measurements", measurements, "--replace-border-hash", hash, "--replacement-reason", "Pinned imagery establishes a different original road branch."];
    const run = () => spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 20000 });
    const batch = spawnSync(process.execPath, [...args, "--all"], { cwd: root, encoding: "utf8", timeout: 20000 });
    assert.notEqual(batch.status, 0);
    assert.match(batch.stderr, /never --all or --check/);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /retained-existing-borders/);
    assert.deepEqual(await readFile(join(root, layoutPath)), bytes);
    assert.deepEqual(await readFile(join(root, trackPath)), trackBytes);
    // A metadata rejection must also be caught, rather than escaping as an
    // unhandled acquisition rejection while the measurement file is loading.
    const invalidPin = JSON.parse(await readFile(pin, "utf8"));
    delete invalidPin.reuseEvidenceUrl;
    await writeFile(pin, JSON.stringify(invalidPin));
    const rejected = run();
    assert.equal(rejected.status, 0, rejected.stderr);
    assert.match(rejected.stdout, /retained-existing-borders/);
    assert.deepEqual(await readFile(join(root, layoutPath)), bytes);
    assert.deepEqual(await readFile(join(root, trackPath)), trackBytes);

    // A fully covered synthetic raster exercises the successful transaction.
    // These artificial constant-width edges are a fixture, not track evidence.
    const trace = layout.features.find((f: { properties: { role: string } }) => f.properties.role === "trace").geometry.coordinates;
    const f = imageCrossSections(trace), stations = [...Array.from({ length: Math.ceil(f.count / 8) }, (_, i) => i * 8), f.count];
    const input = { method: "cross-section-image-anchors-v1", imageSha256: "", note: "Synthetic geometry and coverage fixture; these are not real measured road edges.", patches: ["inner", "outer"].map((edge, side) => ({ edge, anchors: stations.map((station) => {
      const i = station % f.count, p = f.smooth[i], n = f.normals[i], offset = side ? 4 : -4;
      return { station, kind: "image-measured", coordinate: f.projection.from([p[0] + n[0] * offset, p[1] + n[1] * offset]) };
    }) })) };
    const png = new PNG({ width: 2048, height: 2048 }); png.data.fill(255);
    const raster = PNG.sync.write(png), rasterHash = createHash("sha256").update(raster).digest("hex");
    const merc = (p: number[]) => [6378137 * p[0] * Math.PI / 180, 6378137 * Math.asinh(Math.tan(p[1] * Math.PI / 180))];
    const points = trace.map(merc), xs = points.map((p: number[]) => p[0]), ys = points.map((p: number[]) => p[1]);
    await writeFile(pin, JSON.stringify({ ...invalidPin, reuseEvidenceUrl: "https://example.org/rights", sha256: rasterHash, width: 2048, height: 2048, extent3857: [Math.min(...xs) - 100, Math.min(...ys) - 100, Math.max(...xs) + 100, Math.max(...ys) + 100] }));
    await writeFile(join(root, "image.png"), raster);
    input.imageSha256 = rasterHash;
    const tooNarrow = structuredClone(input);
    tooNarrow.patches.forEach((patch, side) => patch.anchors.forEach((anchor) => {
      const i = anchor.station % f.count, p = f.smooth[i], n = f.normals[i], offset = side ? 1 : -1;
      anchor.coordinate = f.projection.from([p[0] + n[0] * offset, p[1] + n[1] * offset]);
    }));
    await writeFile(measurements, JSON.stringify(tooNarrow));
    const rejectedWidth = run();
    assert.equal(rejectedWidth.status, 0, rejectedWidth.stderr);
    assert.match(rejectedWidth.stdout, /retained-existing-borders/);
    assert.deepEqual(await readFile(join(root, layoutPath)), bytes);
    assert.deepEqual(await readFile(join(root, trackPath)), trackBytes);
    await writeFile(measurements, JSON.stringify(input));
    const accepted = run();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /inferred-estimate/);
    const corrected = JSON.parse(await readFile(join(root, layoutPath), "utf8"));
    assert.equal(corrected.metadata.borderInference.supersedes.borderSha256, hash);
    assert.deepEqual(corrected.features.filter((f: { properties: { role: string } }) => !["inner", "outer"].includes(f.properties.role)), layout.features.filter((f: { properties: { role: string } }) => !["inner", "outer"].includes(f.properties.role)));
    assert.equal(corrected.metadata.model3d, undefined);
    assert.deepEqual(JSON.parse(await readFile(join(root, `data/elevation/${entry.id}.json`), "utf8")), layout.metadata.model3d.terrain);
    const acceptedBytes = await readFile(join(root, layoutPath));
    const replay = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("scripts/infer-borders.ts"), "--track", entry.id, "--layout", track.layouts[0].id, "--refresh", "--write", "--cached-image", pin], { cwd: root, encoding: "utf8", timeout: 20000 });
    assert.equal(replay.status, 0, replay.stderr);
    assert.match(replay.stdout, /inferred-estimate/);
    assert.deepEqual(await readFile(join(root, layoutPath)), acceptedBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
