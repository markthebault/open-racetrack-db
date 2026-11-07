import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { niedersachsenImagery } from "../scripts/niedersachsen-imagery";
const layout = {
  bbox: [7.28, 52.79, 7.2802, 52.7902] as [number, number, number, number],
};
function fixture(
  options: { transparent?: boolean; blank?: boolean; wrongSize?: boolean; status?: number } = {},
) {
  let requests = 0;
  const fetcher: typeof fetch = async (input) => {
    requests++;
    if (options.status)
      return new Response("Unavailable", { status: options.status });
    const url = new URL(String(input)),
      width =
        Number(url.searchParams.get("WIDTH")) + (options.wrongSize ? 1 : 0),
      height = Number(url.searchParams.get("HEIGHT")),
      png = new PNG({ width, height });
    png.data.fill(options.blank ? 255 : 150);
    for (let i = 0; i < png.data.length; i += 4) {
      if (!options.blank) png.data[i] = 100 + ((i / 4) % 50);
      png.data[i + 3] = options.transparent ? 0 : 255;
    }
    return new Response(new Uint8Array(PNG.sync.write(png)));
  };
  return { fetcher, requests: () => requests };
}
test("Niedersachsen imagery pins the named WMS collection, georeferencing, rights and cached hash", async () => {
  const root = await mkdtemp(join(tmpdir(), "niedersachsen-imagery-")),
    mock = fixture();
  try {
    const result = await niedersachsenImagery(layout, {
        project: "current",
        root,
        fetcher: mock.fetcher,
      }),
      url = new URL(result.info.url);
    assert.equal(
      url.searchParams.get("LAYERS"),
      "ni_dop20",
    );
    assert.equal(url.pathname, "/doorman/noauth/dop_wms");
    assert.equal(url.searchParams.get("CRS"), "EPSG:3857");
    assert.equal(url.searchParams.get("REQUEST"), "GetMap");
    assert.deepEqual(
      url.searchParams.get("BBOX")!.split(",").map(Number),
      result.info.extent3857,
    );
    assert.equal(result.info.license, "CC-BY-4.0");
    assert.match(result.info.attribution, /LGLN/);
    assert.ok(result.info.groundPixelSizeM <= 0.2);
    assert.equal(mock.requests(), 1);
    const again = await niedersachsenImagery(layout, {
      project: "current",
      root,
      fetcher: async () => {
        throw new Error("Unexpected network");
      },
    });
    assert.deepEqual(again.info, result.info);
    assert.deepEqual(again.image.data, result.image.data);
    const changed = structuredClone(result.info);
    changed.extent3857[0] += 10;
    await writeFile(result.cachedImage, JSON.stringify(changed));
    await assert.rejects(
      niedersachsenImagery(layout, {
        project: "current",
        root,
        fetcher: mock.fetcher,
      }),
      /georeferenced request/,
    );
    await writeFile(result.cachedImage, JSON.stringify(result.info));
    const bytes = await readFile(result.cachedImage.replace(/\.json$/, ".png"));
    bytes[bytes.length - 1] ^= 1;
    await writeFile(result.cachedImage.replace(/\.json$/, ".png"), bytes);
    await assert.rejects(
      niedersachsenImagery(layout, {
        project: "current",
        root,
        fetcher: mock.fetcher,
      }),
      /hash/,
    );
    assert.equal(mock.requests(), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Niedersachsen rejects absent coverage, changed dimensions and failed requests without collection fallback", async () => {
  for (const options of [
    { transparent: true },
    { blank: true },
    { wrongSize: true },
    { status: 404 },
  ]) {
    const root = await mkdtemp(join(tmpdir(), "niedersachsen-imagery-")),
      mock = fixture(options);
    try {
      await assert.rejects(
        niedersachsenImagery(layout, {
          project: "2024",
          root,
          fetcher: mock.fetcher,
        }),
        /coverage|dimensions|HTTP 404/,
      );
      assert.equal(mock.requests(), 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
test("Niedersachsen bounds and output resolution respect the 6000px acquisition cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "niedersachsen-imagery-")),
    mock = fixture();
  try {
    await assert.rejects(
      niedersachsenImagery(
        { bbox: [-81, 46, -80.5, 46.5] },
        { project: "current", root, fetcher: mock.fetcher },
      ),
      /bounded route/,
    );
    await assert.rejects(
      niedersachsenImagery(
        { bbox: [7, 52, 8, 53] },
        { project: "current", root, fetcher: mock.fetcher },
      ),
      /too large/,
    );
    assert.equal(mock.requests(), 0);
    await assert.rejects(
      niedersachsenImagery(layout, {
        project: "2027" as "current",
        root,
        fetcher: mock.fetcher,
      }),
    );
    assert.equal(mock.requests(), 0);
    const result = await niedersachsenImagery(
      { bbox: [7.28, 52.79, 7.32, 52.7902] },
      { project: "current", root, fetcher: mock.fetcher },
    );
    assert.equal(result.info.width, 6000);
    assert.ok(
      result.info.height <= 6000 &&
        result.info.groundPixelSizeM > 0.2 &&
        result.info.groundPixelSizeM <= 1.5,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Niedersachsen historical annual collection stays explicit and retains its native resolution", async () => {
  const root = await mkdtemp(join(tmpdir(), "niedersachsen-imagery-")),
    mock = fixture();
  try {
    const result = await niedersachsenImagery(layout, {
        project: "2024",
        root,
        fetcher: mock.fetcher,
      }),
      url = new URL(result.info.url);
    assert.equal(
      url.searchParams.get("LAYERS"),
      "ni_dop20h_rgb_2024",
    );
    assert.ok(
      result.info.groundPixelSizeM <= 0.2 &&
        result.info.groundPixelSizeM > 0.199,
    );
    assert.match(result.info.attribution, /2024/);
    assert.equal(url.pathname, "/doorman/noauth/doph_wms");
    assert.equal(mock.requests(), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
