import { test } from "node:test";
import assert from "node:assert/strict";
import { borderRefinementInputSchema } from "../schemas/border-refinement";
import {
  refineImageBorders,
  borderPairHash,
} from "../scripts/refine-image-borders";
import { plane, distance, type Position } from "../src/geo";
import { assertSeparateSimpleRings } from "../src/boundary-path";
import { inferImageBorders, inferRefinedImageBorders, type Raster } from "../scripts/infer-image-borders";
const p = plane([0, 0]),
  point = (r: number, i: number): Position =>
    p.from([
      r * Math.cos((i * Math.PI) / 90),
      r * Math.sin((i * Math.PI) / 90),
    ]);
function fixture() {
  const trace = Array.from({ length: 181 }, (_, i) => point(100, i));
  trace[180] = trace[0];
  const image: Raster = {
    width: 512,
    height: 512,
    extent: [-256, -256, 256, 256],
    data: new Uint8Array(512 * 512 * 4),
  };
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const r = Math.hypot(x - 255.5, 255.5 - y);
      image.data.set(
        r >= 94 && r <= 106 ? [90, 90, 90, 255] : [45, 150, 50, 255],
        (y * 512 + x) * 4,
      );
    }
  const original = inferImageBorders(trace, image, {
      method: "road-local-appearance-v4",
    }),
    seed = structuredClone(original);
  for (let i = 21; i < 40; i++) {
    const a = p.to(seed.inner[i]),
      b = p.to(seed.outer[i]),
      norm = Math.hypot(b[0] - a[0], b[1] - a[1]),
      d = 4 * Math.sin(((i - 20) * Math.PI) / 20);
    seed.outer[i] = p.from([
      b[0] - (d * (b[0] - a[0])) / norm,
      b[1] - (d * (b[1] - a[1])) / norm,
    ]);
  }
  const input = borderRefinementInputSchema.parse({
    method: "cross-section-image-anchors-v1",
    imageSha256: "b".repeat(64),
    seedSha256: borderPairHash(seed),
    patches: [
      {
        edge: "outer",
        anchors: [20, 30, 40].map((station) => ({
          station,
          kind: "image-measured",
          coordinate: original.outer[station],
        })),
      },
    ],
    note: "Measure the visible pavement edge through the artificial seam section.",
  });
  return { seed, trace, original, image, input };
}
test("sparse pinned-image anchors correct a section while preserving pairing and all other source vertices", () => {
  const { seed, trace, original, image, input } = fixture(),
    before = structuredClone(seed),
    { result, refinement } = refineImageBorders(
      seed,
      trace,
      input,
      image,
      "b".repeat(64),
    );
  assert.deepEqual(seed, before);
  assert.deepEqual(result.inner, seed.inner);
  assert.deepEqual(result.outer.slice(0, 20), seed.outer.slice(0, 20));
  assert.deepEqual(result.outer.slice(41), seed.outer.slice(41));
  assert.ok(distance(result.outer[30], original.outer[30]) < 0.02);
  assert.equal(result.inner.length, result.outer.length);
  assert.equal(refinement.resultSha256, borderPairHash(result));
  assert.deepEqual(refinement.patches, input.patches);
});
test("image correction rejects stale evidence, invalid stations, missing imagery and unsupported geometry", () => {
  const { seed, trace, original, image, input } = fixture();
  assert.throws(
    () => refineImageBorders(seed, trace, input, image, "c".repeat(64)),
    /hash/,
  );
  const stale = structuredClone(seed);
  stale.outer[25] = point(105, 25);
  assert.throws(
    () => refineImageBorders(stale, trace, input, image, "b".repeat(64)),
    /hash/,
  );
  const station = structuredClone(input);
  station.patches[0].anchors.at(-1)!.station = 99999;
  assert.throws(
    () => refineImageBorders(seed, trace, station, image, "b".repeat(64)),
    /station/,
  );
  const missing = structuredClone(image);
  missing.data!.fill(0);
  assert.throws(
    () => refineImageBorders(seed, trace, input, missing, "b".repeat(64)),
    /coverage/,
  );
  const narrow = structuredClone(input);
  narrow.patches[0].anchors[1].coordinate = seed.inner[30];
  assert.throws(
    () => refineImageBorders(seed, trace, narrow, image, "b".repeat(64)),
    /width/,
  );
  const shifted = structuredClone(input);
  shifted.patches[0].anchors[1].coordinate = original.outer[34];
  assert.throws(
    () => refineImageBorders(seed, trace, shifted, image, "b".repeat(64)),
    /cross-section/,
  );
  const preserved = structuredClone(input);
  preserved.patches[0].anchors[1].kind = "preserved-seed";
  assert.throws(
    () => refineImageBorders(seed, trace, preserved, image, "b".repeat(64)),
    /Preserved/,
  );
  const outside = structuredClone(input);
  outside.patches[0].anchors[1].coordinate = [1, 1];
  assert.throws(
    () => refineImageBorders(seed, trace, outside, image, "b".repeat(64)),
    /outside/,
  );
  const closure = structuredClone(input);
  closure.patches = [
    {
      edge: "outer",
      anchors: [
        { station: 0, kind: "image-measured", coordinate: seed.outer[0] },
        {
          station: seed.outer.length - 1,
          kind: "image-measured",
          coordinate: seed.inner[0],
        },
      ],
    },
  ];
  assert.throws(
    () => refineImageBorders(seed, trace, closure, image, "b".repeat(64)),
    /closure|width/,
  );
  const duplicate = structuredClone(input);
  duplicate.patches.push(duplicate.patches[0]);
  assert.equal(borderRefinementInputSchema.safeParse(duplicate).success, false);
  const unordered = structuredClone(input);
  unordered.patches[0].anchors.reverse();
  assert.equal(borderRefinementInputSchema.safeParse(unordered).success, false);
});

test("a redistributed refined GeoJSON verifies without imagery and detects edits away from its anchors", async () => {
  const { readFile, writeFile, mkdir, mkdtemp, cp, rm } =
      await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join, dirname } = await import("node:path"),
    { fileURLToPath, pathToFileURL } = await import("node:url"),
    { spawnSync } = await import("node:child_process");
  const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));
  for (const [id, layoutId] of [
    ["us-arizona-motorsports-park-9f848c55", "arizona-motorsports-park"],
    ["gb-curborough-68a60e27", "curborough"],
    ["gb-m-sport-proving-ground-fe7c7315", "msport-inner-variant"],
  ]) {
    const entry = (await read("data/index.json")).tracks.find(
        (t: { id: string }) => t.id === id,
      ),
      track = await read(`data/${entry.file}`),
      item = track.layouts.find((l: { id: string }) => l.id === layoutId),
      file = `data/${dirname(entry.file)}/${item.file}`,
      root = await mkdtemp(join(tmpdir(), "refined-track-"));
    try {
      await mkdir(join(root, dirname(file)), { recursive: true });
      await cp(`data/${entry.file}`, join(root, "data", entry.file));
      await cp(file, join(root, file));
      await writeFile(
        join(root, "data/index.json"),
        JSON.stringify({ schemaVersion: 1, tracks: [entry] }),
      );
      await writeFile(
        join(root, "deny-network.mjs"),
        "globalThis.fetch=async()=>{throw new Error('No network allowed for public-data validation');};",
      );
      const check = () =>
        spawnSync(
          process.execPath,
          [
            "--import",
            pathToFileURL(join(root, "deny-network.mjs")).href,
            "--import",
            import.meta.resolve("tsx"),
            fileURLToPath(
              new URL("../scripts/infer-borders.ts", import.meta.url),
            ),
            "--track",
            id,
            "--layout",
            layoutId,
            "--check",
          ],
          { cwd: root, encoding: "utf8" },
        );
      const valid = check();
      assert.equal(valid.status, 0, valid.stderr);
      const d = await read(join(root, file)),
        edge = d.features.find(
          (f: { properties: { role: string } }) =>
            f.properties.role === "outer",
        );
      const anchored = new Set(
        d.metadata.borderInference.refinement.patches
          .filter((p: { edge: string }) => p.edge === "outer")
          .flatMap((p: { anchors: { station: number }[] }) =>
            p.anchors.map((a) => a.station),
          ),
      );
      const station = edge.geometry.coordinates.findIndex(
        (_: Position, i: number) => i > 0 && !anchored.has(i),
      );
      edge.geometry.coordinates[station][0] += 0.000001;
      await writeFile(join(root, file), JSON.stringify(d));
      const edited = check();
      assert.notEqual(edited.status, 0);
      assert.match(edited.stderr, /refined border hash mismatch/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("open image corrections preserve distinct endpoints and left/right order", () => {
  const trace = Array.from({ length: 81 }, (_, i) =>
    p.from([0, -100 + i * 2.5]),
  );
  const image: Raster = {
    width: 512,
    height: 512,
    extent: [-256, -256, 256, 256],
    data: new Uint8Array(512 * 512 * 4),
  };
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++)
      image.data!.set(
        Math.abs(x - 255.5) < 6 ? [90, 90, 90, 255] : [45, 150, 50, 255],
        (y * 512 + x) * 4,
      );
  const seed = inferImageBorders(trace, image, {
    method: "road-local-appearance-v4",
    open: true,
  });
  const last = seed.inner.length - 1;
  const measured = (station: number): Position => {
    const a = p.to(seed.inner[station]);
    return p.from([a[0] - 0.5, a[1]]);
  };
  const input = borderRefinementInputSchema.parse({
    method: "cross-section-image-anchors-v1",
    imageSha256: "d".repeat(64),
    seedSha256: borderPairHash(seed),
    patches: [
      {
        edge: "inner",
        anchors: [0, last].map((station) => ({
          station,
          kind: "image-measured",
          coordinate: measured(station),
        })),
      },
    ],
    note: "Measured open edge endpoints on the pinned synthetic road image.",
  });
  const { result } = refineImageBorders(
    seed,
    trace,
    input,
    image,
    "d".repeat(64),
    { open: true },
  );
  assert.ok(distance(result.inner[0], result.inner.at(-1)!) > 190);
  assert.ok(distance(result.inner[0], measured(0)) < 0.03);
  assert.ok(distance(result.inner[last], measured(last)) < 0.03);
  assert.deepEqual(result.outer, seed.outer);
  assert.equal(result.inner.length, seed.inner.length);
  assert.throws(
    () => refineImageBorders(seed, trace, input, image, "d".repeat(64)),
    /closure/,
  );
  assert.throws(
    () =>
      refineImageBorders(
        seed,
        [...trace, trace[0]],
        input,
        image,
        "d".repeat(64),
        { open: true },
      ),
    /closure/,
  );
  const swapped = { ...seed, inner: seed.outer, outer: seed.inner };
  const reversed = {
    ...input,
    seedSha256: borderPairHash(swapped),
    patches: [
      {
        edge: "inner" as const,
        anchors: [0, last].map((station) => ({
          station,
          kind: "image-measured" as const,
          coordinate: swapped.inner[station],
        })),
      },
    ],
  };
  assert.throws(
    () =>
      refineImageBorders(swapped, trace, reversed, image, "d".repeat(64), {
        open: true,
      }),
    /left\/right/,
  );
});

test("open border topology checks the first and last segments for crossings", async () => {
  const { assertSeparateSimpleRings } = await import("../src/boundary-path");
  assert.throws(
    () =>
      assertSeparateSimpleRings(
        [
          [
            [0, 0],
            [10, 10],
            [0, 10],
            [10, 0],
          ],
        ],
        false,
      ),
    /cross or touch/,
  );
  assert.throws(
    () =>
      assertSeparateSimpleRings(
        [
          [
            [0, 0],
            [10, 0],
          ],
          [
            [5, -5],
            [5, 5],
          ],
        ],
        false,
      ),
    /cross or touch/,
  );
});

test("paired junction anchors repair a crossed seed and preserve untouched geometry", () => {
  const { seed, trace, original, image } = fixture();
  [seed.inner[24], seed.inner[26]] = [seed.inner[26], seed.inner[24]];
  assert.throws(() => assertSeparateSimpleRings([seed.inner.map(p.to), seed.outer.map(p.to)], true), /cross|intersect/);
  const before = structuredClone(seed);
  const input = borderRefinementInputSchema.parse({
    method: "paired-image-edge-anchors-v1",
    interpolation: "edge-linear-v1",
    imageSha256: "b".repeat(64),
    seedSha256: borderPairHash(seed),
    patches: (["inner", "outer"] as const).map(edge => ({
      edge,
      anchors: [20, 30, 40].map(station => ({
        station,
        kind: station === 30 ? "image-measured" : "preserved-seed",
        coordinate: station === 30 ? original[edge][32] : seed[edge][station],
      })),
    })),
    note: "Paired image points follow a junction independently of the old source normals.",
  });
  const { result, refinement } = refineImageBorders(seed, trace, input, image, "b".repeat(64));
  assert.deepEqual(seed, before);
  for (const edge of ["inner", "outer"] as const) {
    assert.deepEqual(result[edge].slice(0, 20), before[edge].slice(0, 20));
    assert.deepEqual(result[edge].slice(41), before[edge].slice(41));
    assert.ok(distance(result[edge][30], original[edge][32]) < 0.03);
  }
  assert.equal(refinement.resultSha256, borderPairHash(result));
  assert.throws(() => refineImageBorders(seed, trace, {
    ...input, method: "cross-section-image-anchors-v1", interpolation: undefined,
  }, image, "b".repeat(64)), /along the route/);
  const displaced = structuredClone(input);
  for (const patch of displaced.patches) patch.anchors[1].coordinate = original[patch.edge][35];
  assert.throws(() => refineImageBorders(seed, trace, displaced, image, "b".repeat(64)), /10 metres/);
  const incomplete = structuredClone(input);
  incomplete.patches.pop();
  assert.equal(borderRefinementInputSchema.safeParse(incomplete).success, false);
  const gap = structuredClone(input);
  for (const patch of gap.patches) patch.anchors[2].station = 60;
  assert.throws(() => refineImageBorders(seed, trace, gap, image, "b".repeat(64)), /50 metres/);
});


test("inference applies pinned paired corrections and rejects invalid corrections without returning a seed", () => {
  const { trace, original, image } = fixture();
  const input = borderRefinementInputSchema.parse({
    method: "paired-image-edge-anchors-v1", interpolation: "edge-linear-v1",
    imageSha256: "b".repeat(64), seedSha256: borderPairHash(original),
    patches: (["inner", "outer"] as const).map(edge => ({ edge,
      anchors: [20, 30, 40].map(station => ({ station, kind: "image-measured",
        coordinate: original[edge][station === 30 ? 32 : station] })),
    })),
    note: "Pinned visible edge pairs through the junction.",
  });
  const options = { method: "road-local-appearance-v4" as const };
  const direct = refineImageBorders(original, trace, input, image, "b".repeat(64));
  const inferred = inferRefinedImageBorders(trace, image, input, "b".repeat(64), options);
  assert.deepEqual(inferred, direct);
  assert.throws(() => inferRefinedImageBorders(trace, image, input, "c".repeat(64), options), /image hash/);
  assert.throws(() => inferRefinedImageBorders(trace, image, {...input, seedSha256: "c".repeat(64)}, "b".repeat(64), options), /seed hash/);
  const invalid = structuredClone(input);
  for (const patch of invalid.patches) patch.anchors[1].coordinate = original[patch.edge][35];
  assert.throws(() => inferRefinedImageBorders(trace, image, invalid, "b".repeat(64), options), /10 metres/);
  const featureless = { ...image, data: new Uint8Array(image.width * image.height * 4).fill(128) };
  assert.throws(() => inferRefinedImageBorders(trace, featureless, input, "b".repeat(64), options), /search limit|image-edge evidence|coherent image/);
});
