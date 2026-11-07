import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { quebecImagery } from "../scripts/quebec-imagery";
const layout = {
  bbox: [-71.8, 46.6, -71.7998, 46.6002] as [number, number, number, number],
};
function fixture(
  options: { transparent?: boolean; wrongSize?: boolean; status?: number } = {},
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
    png.data.fill(150);
    for (let i = 3; i < png.data.length; i += 4)
      png.data[i] = options.transparent ? 0 : 255;
    return new Response(new Uint8Array(PNG.sync.write(png)));
  };
  return { fetcher, requests: () => requests };
}
test("Québec imagery pins the named WMS collection, georeferencing, rights and cached hash", async () => {
  const root = await mkdtemp(join(tmpdir(), "quebec-imagery-")),
    mock = fixture();
  try {
    const result = await quebecImagery(layout, {
        project: "IEQM2025",
        root,
        fetcher: mock.fetcher,
      }),
      url = new URL(result.info.url);
    assert.equal(
      url.searchParams.get("LAYERS"),
      "Orthomosaique_2025_2025_Inv_Ecofor_20cm_RVB",
    );
    assert.equal(url.searchParams.get("CRS"), "EPSG:3857");
    assert.equal(url.searchParams.get("REQUEST"), "GetMap");
    assert.deepEqual(
      url.searchParams.get("BBOX")!.split(",").map(Number),
      result.info.extent3857,
    );
    assert.equal(result.info.license, "CC-BY-4.0");
    assert.match(result.info.attribution, /Gouvernement du Québec/);
    assert.ok(result.info.groundPixelSizeM <= 0.2);
    assert.equal(mock.requests(), 1);
    const again = await quebecImagery(layout, {
      project: "IEQM2025",
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
      quebecImagery(layout, {
        project: "IEQM2025",
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
      quebecImagery(layout, {
        project: "IEQM2025",
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
test("Québec rejects absent coverage, changed dimensions and failed requests without collection fallback", async () => {
  for (const options of [
    { transparent: true },
    { wrongSize: true },
    { status: 404 },
  ]) {
    const root = await mkdtemp(join(tmpdir(), "quebec-imagery-")),
      mock = fixture(options);
    try {
      await assert.rejects(
        quebecImagery(layout, {
          project: "IEQM2024",
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
test("Québec bounds and output resolution remain bounded by the 4000px WMS limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "quebec-imagery-")),
    mock = fixture();
  try {
    await assert.rejects(
      quebecImagery(
        { bbox: [-81, 46, -80.5, 46.5] },
        { project: "IEQM2025", root, fetcher: mock.fetcher },
      ),
      /bounded route/,
    );
    await assert.rejects(
      quebecImagery(
        { bbox: [-72, 46, -71, 47] },
        { project: "IEQM2025", root, fetcher: mock.fetcher },
      ),
      /too large/,
    );
    assert.equal(mock.requests(), 0);
    await assert.rejects(
      quebecImagery(layout, {
        project: "IEQM2023" as "IEQM2025",
        root,
        fetcher: mock.fetcher,
      }),
    );
    assert.equal(mock.requests(), 0);
    const result = await quebecImagery(
      { bbox: [-72, 46, -71.98, 46.0002] },
      { project: "IEQM2025", root, fetcher: mock.fetcher },
    );
    assert.equal(result.info.width, 4000);
    assert.ok(
      result.info.height <= 4000 &&
        result.info.groundPixelSizeM > 0.2 &&
        result.info.groundPixelSizeM <= 1.5,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Québec historical partner collection stays explicit and retains its native resolution", async () => {
  const root = await mkdtemp(join(tmpdir(), "quebec-imagery-")),
    mock = fixture();
  try {
    const result = await quebecImagery(layout, {
        project: "CHAUDIERE2020",
        root,
        fetcher: mock.fetcher,
      }),
      url = new URL(result.info.url);
    assert.equal(
      url.searchParams.get("LAYERS"),
      "Orthomosaique_2020_2020_Partenariat_Chaudiere-Appalaches_15cm_RVB",
    );
    assert.ok(
      result.info.groundPixelSizeM <= 0.15 &&
        result.info.groundPixelSizeM > 0.149,
    );
    assert.match(result.info.attribution, /CHAUDIERE2020/);
    assert.equal(mock.requests(), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
