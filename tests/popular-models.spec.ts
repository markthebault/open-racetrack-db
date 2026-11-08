import { test, expect } from "@playwright/test";
import { popularModels } from "../scripts/popular-models";
const raster = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
test("all 20 popular layouts play from one GeoJSON with track-specific labels and truthful source quality", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [],
    sidecars: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/\/data\/elevation\//.test(r.url())) sidecars.push(r.url());
  });
  await page.route("**/server.arcgisonline.com/**", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: raster,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  for (const selected of popularModels) {
    await page.goto(
      `/?track=${selected.trackId}&layout=${selected.layoutId}&lap=1`,
    );
    await expect(page.locator(".lap-loading")).toBeHidden({ timeout: 15000 });
    await expect(page.locator(".lap-status")).toHaveText(
      "Aerial imagery loaded",
    );
    await expect(page.locator("[data-quality]")).toContainText(
      "Illustrative curbs",
    );
    await expect(page.locator(".lap-profile-caption")).toContainText(
      "Terrain estimate",
    );
    await expect(page.locator(".lap-header")).not.toContainText("Ardennes");
    await expect(page.locator(".lap-imagery-credit")).toContainText("Esri");
    await page.locator(".lap-play").click();
    await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
    await page.locator(".lap-play").click();
    const max = Number(
      await page.locator(".lap-timeline input").getAttribute("max"),
    );
    await page
      .locator(".lap-timeline input")
      .fill(String(Math.floor(max * 0.6)));
    await expect(page.locator("[data-speed]")).not.toHaveText("0");
    await page.locator("[data-camera=above]").click();
    await page.locator("[data-camera=chase]").click();
    const href = await page.locator("#download").getAttribute("href");
    const data = await (await page.request.get(href!)).json();
    expect(data.metadata.trackId).toBe(selected.trackId);
    expect(data.metadata.model3d.quality.curbs).toBe("geometry-estimated");
    await page.getByRole("button", { name: "Close lap simulator" }).click();
    await expect(page.locator(".lap-player")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  expect(sidecars).toEqual([]);
});

test("changing layouts hides playback when the selected layout has no prepared model", async ({
  page,
}) => {
  await page.route(
    "**/layouts/monza-without-chicane.geojson",
    async (route) => {
      const data = await (await route.fetch()).json();
      delete data.metadata.model3d;
      await route.fulfill({ json: data });
    },
  );
  await page.goto("/?track=it-monza&layout=grand-prix");
  await expect(page.locator("#play-lap")).toBeVisible();
  await page.locator("#layout").selectOption("monza-without-chicane");
  await expect(page.locator("#message")).toHaveText("Layout ready");
  await expect(page.locator("#play-lap")).toBeHidden();
});
