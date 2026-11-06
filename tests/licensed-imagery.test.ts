import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  licensedImagery,
  ImageryQuotaError,
} from "../scripts/licensed-imagery";
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
