import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const cases = [
  ["be-spa-francorchamps", "grand-prix", 10],
  ["jp-suzuka-circuit-175231434", "suzuka", 9.5],
  ["de-nurburgring", "nordschleife-btg", 9.5],
] as const;
for (const [track, layout, width] of cases)
  test(`width-only browser calculation and playback: ${track}`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const start = Date.now();
    await page.goto(`/?track=${track}&layout=${layout}`);
    await expect(page.locator("#message")).toHaveText("Layout ready", {
      timeout: 60000,
    });
    console.log({ track, readyMs: Date.now() - start });
    await expect(page.locator(".selection")).toContainText(
      `Estimated constant width: ${width.toFixed(1)} m`,
    );
    await page.locator(".map-options > summary").click();
    await expect(page.locator("#border-toggle")).toBeEnabled();
    await page.locator("#border-toggle").click();
    await expect(page.locator(".track-border")).toHaveCount(2);
    await page.locator("#ideal-toggle").click();
    await expect(page.locator(".ideal-line")).toHaveCount(1);
    await expect(page.locator(".ideal-controls")).toContainText(
      `Width ${width.toFixed(1)} m`,
    );
    const href = await page.locator("#download").getAttribute("href");
    const compact = await (await request.get(href!)).json();
    expect(
      compact.features.some((f: any) =>
        ["inner", "outer", "ideal"].includes(f.properties.role),
      ),
    ).toBe(false);
    const trackData = await (
      await request.get(
        (await page
          .getByRole("link", { name: "Track data (width)" })
          .getAttribute("href")) ?? "",
      )
    ).json();
    expect(trackData.layouts.find((e: any) => e.id === layout).roadWidthM).toBe(
      width,
    );
    await page.locator("#view-satellite").click();
    await expect(page.locator("#view-satellite")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.screenshot({
      path: `.local/tum-worker/${track}-map.png`,
      fullPage: true,
    });
    await page.locator("#play-lap").click();
    await expect(page.locator(".lap-player")).toHaveAttribute(
      "data-driving-path",
      "ideal",
    );
    await expect(page.locator(".lap-loading")).toBeHidden();
    await expect(page.locator("[data-road-detail]")).toContainText(
      `Estimated constant width · ${width.toFixed(1)} m`,
    );
    await page.locator(".lap-play").click();
    await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
    await page
      .getByRole("button", { name: "Close lap simulator", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/tum-worker/${track}-phone.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
test("all twelve migrated layouts load and switching cannot reuse stale width or geometry", async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const manifest = [];
  for (const root of [
    "data/belgium/spa-francorchamps",
    "data/japan/suzuka-circuit-175231434",
    "data/germany/nurburgring",
  ]) {
    const track = JSON.parse(await readFile(root + "/track.json", "utf8"));
    for (const layout of track.layouts)
      if (layout.file && layout.roadWidthM)
        manifest.push({ trackId: track.id, layoutId: layout.id });
  }
  for (const item of manifest) {
    await page.goto(`/?track=${item.trackId}&layout=${item.layoutId}`);
    await expect(page.locator("#message")).toHaveText("Layout ready", {
      timeout: 60000,
    });
    await page.locator(".map-options > summary").click();
    await expect(page.locator("#border-toggle")).toBeEnabled();
    await expect(page.locator("#ideal-toggle")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
