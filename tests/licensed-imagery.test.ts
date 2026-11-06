import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  licensedImagery,
  ImageryQuotaError,
} from "../scripts/licensed-imagery";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { Layout } from "../schemas/data";

test("an imagery quota response stops requests across layouts and process restarts", async () => {
  const root = await mkdtemp(join(tmpdir(), "track-imagery-")),
    original = globalThis.fetch;
  const layout: Pick<Layout, "bbox" | "features"> = {
    bbox: [0, 0, 0.001, 0.001],
    features: [
      {
        type: "Feature",
        id: "trace",
        properties: { role: "trace", sourceIds: ["fixture"] },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [0.001, 0],
            [0.001, 0.001],
            [0, 0.001],
            [0, 0],
          ],
        },
      },
    ],
  };
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("Too many requests", {
      status: 429,
      headers: { "retry-after": "120" },
    });
  };
  try {
    const acquire = licensedImagery("fixture-private-key", 1000, root);
    const validate = (error: unknown) =>
      error instanceof ImageryQuotaError &&
      Date.parse(error.retryAt) > Date.now() &&
      !error.message.includes("fixture-private-key");
    await assert.rejects(() => acquire(layout), validate);
    await assert.rejects(() => acquire(layout), validate);
    await assert.rejects(
      () => licensedImagery("fixture-private-key", 1000, root)(layout),
      validate,
    );
    assert.equal(
      calls,
      1,
      "The provider must not be polled during its retry window",
    );
  } finally {
    globalThis.fetch = original;
    await rm(root, { recursive: true, force: true });
  }
});

test("large disconnected corridors retain native pixels and reuse a pinned tile cache without fetching the empty bounding area", async () => {
  const root = await mkdtemp(join(tmpdir(), "track-long-imagery-")),
    original = globalThis.fetch;
  const data = Buffer.alloc(512 * 512 * 4, 180);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const bytes = jpeg.encode({ width: 512, height: 512, data }, 80).data;
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests++;
    return String(input).includes("tiles.json")
      ? new Response(JSON.stringify({ attribution: "Fixture imagery" }))
      : new Response(new Uint8Array(bytes));
  };
  const layout: Pick<Layout, "bbox" | "features"> = {
    bbox: [0, 0, 0.1001, 0.1],
    features: [
      {
        type: "Feature",
        id: "trace",
        properties: { role: "trace", sourceIds: ["fixture"] },
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [0, 0],
              [0.0001, 0],
            ],
            [
              [0.1, 0.1],
              [0.1001, 0.1],
            ],
          ],
        },
      },
    ],
  };
  try {
    const result = await licensedImagery(
      "fixture-private-key",
      1000,
      root,
    )(layout);
    assert.equal(result.info.encoding, "xyz-jpeg-manifest-v1");
    assert.ok(result.info.width * result.info.height > 64000000);
    assert.ok(result.info.groundPixelSizeM <= 0.75);
    assert.ok(result.image.sample);
    assert.deepEqual(
      result.image.sample(
        Math.floor(result.info.width / 2),
        Math.floor(result.info.height / 2),
      ),
      [0, 0, 0, 0],
    );
    const files = await readdir(root),
      jpegCount = files.filter((f) => f.endsWith(".jpg")).length;
    assert.ok(jpegCount < 20, "Only the two short corridors should be fetched");
    assert.ok(files.some((f) => f.endsWith(".manifest.json")));
    const preview = PNG.sync.read(
      await readFile(
        join(
          root,
          files.find((f) => f.endsWith(".preview.png"))!,
        ),
      ),
    );
    assert.ok(preview.width <= 2048 && preview.height <= 2048);
    assert.ok(preview.data.some((v, i) => i % 4 === 3 && v === 255));
    const before = requests,
      cached = await licensedImagery("fixture-private-key", 1000, root)(layout);
    assert.equal(requests, before);
    assert.deepEqual(cached.info, result.info);
  } finally {
    globalThis.fetch = original;
    await rm(root, { recursive: true, force: true });
  }
});
