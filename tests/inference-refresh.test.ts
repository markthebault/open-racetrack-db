import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

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
