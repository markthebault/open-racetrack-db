import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
});
test("ideal line remains opt-in, is embedded in download and renders in both views", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?track=be-spa-francorchamps");
  await expect(page.locator("#message")).toHaveText("Layout ready");
  await expect(page.locator(".ideal-line")).toHaveCount(0);
  await expect(page.locator("#ideal-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#ideal-toggle").click();
  await expect(page.locator(".ideal-line")).toHaveCount(1);
  await expect(page.locator(".course-trace")).toHaveCount(0);
  const download = await (
    await request.get((await page.locator("#download").getAttribute("href"))!)
  ).json();
  expect(
    download.features.find((f: any) => f.properties.role === "ideal").properties
      .estimated,
  ).toBe(true);
  await page.locator("#view-3d").click();
  await expect(page.locator("#track-3d")).toHaveAttribute(
    "data-ideal-lines",
    "1",
  );
  await page.locator("#ideal-toggle").click();
  await expect(page.locator("#track-3d")).toHaveAttribute(
    "data-ideal-lines",
    "0",
  );
  await page.locator("#view-2d").click();
  await expect(page.locator(".course-trace")).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("mobile control fits and switching layouts clears stale data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/layouts/with-chicane.geojson", async (route) => {
    const response = await route.fetch(),
      d = await response.json();
    d.features = d.features.filter((f: any) => f.properties.role !== "ideal");
    await route.fulfill({ response, json: d });
  });
  await page.goto("/?track=es-barcelona-catalunya");
  await expect(page.locator("#ideal-toggle")).toBeVisible();
  await page.locator("#ideal-toggle").click();
  await expect(page.locator(".ideal-line")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#layout").selectOption("with-chicane");
  await expect(page.locator("#message")).toHaveText("Layout ready");
  await expect(page.locator(".ideal-line")).toHaveCount(0);
  await expect(page.locator("#ideal-toggle")).toBeHidden();
});
