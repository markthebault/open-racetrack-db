import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Layout } from "../schemas/data";
const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
test("every inferred layout exposes its estimate and credit, downloads the same evidence, and plays in 3D", async ({
  page,
  request,
}) => {
  test.setTimeout(900000);
  const index = await read("data/index.json"),
    selected: { trackId: string; layoutId: string; layout: Layout }[] = [];
  for (const entry of index.tracks) {
    const track = await read(`data/${entry.file}`);
    for (const item of track.layouts)
      if (item.file) {
        const layout: Layout = await read(
          `data/${dirname(entry.file)}/${item.file}`,
        );
        if (layout.metadata.borderInference)
          selected.push({ trackId: entry.id, layoutId: item.id, layout });
      }
  }
  expect(selected.length).toBeGreaterThan(0);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/server.arcgisonline.com/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: image,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  for (const host of [
    "imagery.nationalmap.gov",
    "data.geopf.fr",
    "www.ign.es",
    "api.maptiler.com",
    "ws.geoservices.lrc.gov.on.ca",
    "services.nconemap.gov",
    "opendata.lgln.niedersachsen.de",
  ])
    await page.route(`**/${host}/**`, (route) =>
      route.fulfill({
        contentType: "image/png",
        body: image,
        headers: { "access-control-allow-origin": "*" },
      }),
    );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  for (const [i, item] of selected.entries()) {
    await page.goto(
      `/?track=${item.trackId}&layout=${item.layoutId}&view=3d&height=1`,
    );
    await expect(page.locator("#track-3d")).toHaveAttribute(
      "data-layout-key",
      `${item.trackId}/${item.layoutId}`,
    );
    await expect(page.locator(".inferred-border-note")).toContainText(
      item.layout.metadata.borderInference!.measurement
        ? "Sparse image measurements"
        : item.layout.metadata.borderInference!.refinement
          ? "Includes measured image corrections"
          : "Not manually reviewed",
    );
    await expect(page.locator(".inferred-border-note")).toContainText(
      item.layout.metadata.borderInference!.imagery.attribution,
    );
    await page.locator("#border-toggle").click();
    await expect(page.locator("#border-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const file = await page.locator("#download").getAttribute("href");
    const json = await (await request.get(file!)).json();
    expect(json.metadata.borderInference).toEqual(
      item.layout.metadata.borderInference,
    );
    expect(
      json.features
        .filter((f: any) => ["inner", "outer"].includes(f.properties.role))
        .every((f: any) => f.properties.borderStatus === "estimated"),
    ).toBe(true);
    await page.locator("#play-lap").click();
    await expect(page.locator(".lap-loading")).toBeHidden();
    await page.locator(".lap-play").click();
    await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
    await page
      .getByRole("button", {
        name:
          item.layout.metadata.model3d?.kind === "run"
            ? "Close run simulator"
            : "Close lap simulator",
      })
      .click();
    if ((i + 1) % 10 === 0) console.log(`Checked ${i + 1} inferred layouts`);
  }
  console.log(`Checked all ${selected.length} inferred layouts.`);
  expect(errors).toEqual([]);
});
test("estimated borders remain labelled and usable on a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?track=es-barcelona-catalunya&layout=grand-prix");
  await expect(page.locator(".inferred-border-note")).toContainText(
    "Not manually reviewed",
  );
  await page.locator("#view-3d").click();
  await expect(page.locator("#track-3d canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an imagery quota failure leaves the saved 3D road and lap playback usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api.maptiler.com/**", (route) =>
    route.fulfill({
      status: 429,
      headers: { "access-control-allow-origin": "*" },
      body: "Quota exceeded",
    }),
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto(
    "/?track=de-test-und-prasentationsstrecke-bilster-berg-180270505&layout=main&lap=1",
  );
  await expect(page.locator(".lap-loading")).toBeHidden();
  await expect(page.locator(".lap-status")).toContainText(
    "3D road remains usable",
  );
  await page.locator(".lap-play").click();
  await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
  expect(errors).toEqual([]);
});
