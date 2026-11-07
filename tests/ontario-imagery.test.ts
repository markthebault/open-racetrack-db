import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { ontarioImagery } from "../scripts/ontario-imagery";

const layout = {
  bbox: [-81.42, 42.93, -81.4198, 42.9302] as [number, number, number, number],
};
const host = "https://ws.geoservices.lrc.gov.on.ca";
function fixture(change?: (metadata: Record<string, any>) => void) {
  let bytes: Buffer,
    requests = 0;
  const fetcher: typeof fetch = async (input) => {
    requests++;
    const url = new URL(String(input));
    if (url.pathname.endsWith("exportImage")) {
      const [width, height] = url.searchParams
        .get("size")!
        .split(",")
        .map(Number);
      const [xmin, ymin, xmax, ymax] = url.searchParams
        .get("bbox")!
        .split(",")
        .map(Number);
      const data = Buffer.alloc(width * height * 4, 150);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      const png = new PNG({ width, height });
      png.data = data;
      bytes = PNG.sync.write(png);
      const metadata = {
        href: host + "/output/temporary.png",
        width,
        height,
        extent: { xmin, ymin, xmax, ymax, spatialReference: { wkid: 3857 } },
      };
      change?.(metadata);
      return new Response(JSON.stringify(metadata));
    }
    return new Response(new Uint8Array(bytes!));
  };
  return { fetcher, requests: () => requests };
}

test("Ontario requests pin the named collection and replay cached evidence without network access", async () => {
  const root = await mkdtemp(join(tmpdir(), "ontario-imagery-")),
    mock = fixture();
  try {
    const result = await ontarioImagery(layout, {
      project: "SWOOP2025",
      root,
      fetcher: mock.fetcher,
    });
    const request = new URL(result.info.url),
      rule = JSON.parse(request.searchParams.get("mosaicRule")!);
    assert.equal(rule.where, "Project='SWOOP2025'");
    assert.ok(request.pathname.includes("2023to2027"));
    assert.equal(result.info.license, "OGL-ON-1.0");
    assert.ok(
      result.info.groundPixelSizeM <= 0.2 &&
        result.info.groundPixelSizeM > 0.199,
    );
    assert.equal(result.info.sourceId, "ontario-swoop2025-border-imagery");
    assert.ok(!JSON.stringify(result.info).includes("temporary.png"));
    assert.equal(mock.requests(), 2);
    const again = await ontarioImagery(layout, {
      project: "SWOOP2025",
      root,
      fetcher: async () => {
        throw Error("Unexpected network access");
      },
    });
    assert.deepEqual(again.info, result.info);
    assert.deepEqual(again.image.data, result.image.data);
    assert.deepEqual(
      JSON.parse(await readFile(result.cachedImage, "utf8")),
      result.info,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("historical SWOOP2020 requests use the older service and cannot collide with current imagery", async () => {
  const root = await mkdtemp(join(tmpdir(), "ontario-historical-")),
    mock = fixture();
  try {
    const historical = await ontarioImagery(layout, {
      project: "SWOOP2020",
      root,
      fetcher: mock.fetcher,
    });
    const current = await ontarioImagery(layout, {
      project: "SWOOP2025",
      root,
      fetcher: mock.fetcher,
    });
    const request = new URL(historical.info.url);
    assert.ok(request.pathname.includes("2018to2022"));
    assert.equal(
      JSON.parse(request.searchParams.get("mosaicRule")!).where,
      "Project='SWOOP2020'",
    );
    assert.equal(historical.info.sourceId, "ontario-swoop2020-border-imagery");
    assert.notEqual(historical.cachedImage, current.cachedImage);
    assert.equal(mock.requests(), 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a corrupt Ontario cache is rejected rather than silently replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "ontario-corrupt-")),
    mock = fixture();
  try {
    const result = await ontarioImagery(layout, {
      project: "SCOOP2023",
      root,
      fetcher: mock.fetcher,
    });
    await writeFile(result.cachedImage.replace(/\.json$/, ".png"), "changed");
    await assert.rejects(
      () =>
        ontarioImagery(layout, {
          project: "SCOOP2023",
          root,
          fetcher: mock.fetcher,
        }),
      /pinned request or image hash/,
    );
    assert.equal(mock.requests(), 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unsupported projects and unreasonable or out-of-region extents do not fetch imagery", async () => {
  const fetcher: typeof fetch = async () => {
    throw Error("Unexpected network access");
  };
  await assert.rejects(() =>
    ontarioImagery(layout, { project: "UNKNOWN" as never, fetcher }),
  );
  await assert.rejects(
    () =>
      ontarioImagery({ bbox: [0, 0, 1, 1] }, { project: "SWOOP2025", fetcher }),
    /Ontario's region/,
  );
  await assert.rejects(
    () =>
      ontarioImagery(
        { bbox: [-90, 43, -80, 50] },
        { project: "SWOOP2025", fetcher },
      ),
    /too large/,
  );
});

test("Ontario exports reject cropped extents and unexpected download hosts", async () => {
  for (const change of [
    (m: Record<string, any>) => {
      m.extent.xmin += 5;
    },
    (m: Record<string, any>) => {
      m.href = "https://example.com/image.png";
    },
  ]) {
    const root = await mkdtemp(join(tmpdir(), "ontario-invalid-")),
      mock = fixture(change);
    try {
      await assert.rejects(
        () =>
          ontarioImagery(layout, {
            project: "DRAPE2024",
            root,
            fetcher: mock.fetcher,
          }),
        /georeferenced extent|unexpected download host/,
      );
      assert.equal(mock.requests(), 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("Ontario HTTP and export errors never switch collections or return placeholder imagery", async () => {
  const root = await mkdtemp(join(tmpdir(), "ontario-error-"));
  try {
    await assert.rejects(
      () =>
        ontarioImagery(layout, {
          project: "SWOOP2025",
          root,
          fetcher: async () => new Response("Unavailable", { status: 503 }),
        }),
      /HTTP 503/,
    );
    await assert.rejects(
      () =>
        ontarioImagery(layout, {
          project: "SWOOP2025",
          root,
          fetcher: async () =>
            new Response(JSON.stringify({ error: { message: "No imagery" } })),
        }),
      /no collection fallback/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
