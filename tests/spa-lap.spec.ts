import { test, expect } from "@playwright/test";
// Tiny raster keeps controls/recording tests deterministic and independent of the imagery service.
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async ({ page }) => {
  await page.route("**/geoservices.wallonie.be/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: image,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
});
test("Spa lap is generated on demand, supports playback, spatial selection and car changes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?track=be-spa-francorchamps");
  await expect(page.locator("#play-lap")).toBeVisible();
  await expect(page.locator(".lap-player")).toHaveCount(0);
  await page.locator("#play-lap").click();
  await expect(page.locator(".lap-loading")).toBeHidden();
  await expect(page.locator(".lap-status")).toHaveText("Aerial imagery loaded");
  const original = await page.locator("[data-duration]").innerText();
  await expect(page.locator("[data-peak]")).toHaveText(/2\d\d km\/h/);
  await page.locator(".lap-play").click();
  await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
  await page.locator(".lap-play").click();
  const paused = await page.locator("[data-clock]").innerText();
  await page.waitForTimeout(100);
  await expect(page.locator("[data-clock]")).toHaveText(paused);
  await page.locator(".lap-timeline input").fill("30");
  await expect(page.locator("[data-clock]")).toHaveText("0:30.00");
  for (const camera of ["driver", "above", "orbit"]) {
    await page.locator(`[data-camera=${camera}]`).click();
    await expect(page.locator(`[data-camera=${camera}]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.locator("[data-camera=imagery]").click();
  await expect(page.locator(".lap-imagery .leaflet-image-layer")).toBeVisible();
  await page.locator(".lap-minimap").click({ position: { x: 80, y: 100 } });
  await expect(page.locator("[data-clock]")).not.toHaveText("0:30.00");
  await page.locator("[name=powerHp]").fill("150");
  await page.getByRole("button", { name: "Recalculate lap" }).click();
  await expect(page.locator("[data-duration]")).not.toHaveText(original);
  await page.getByRole("button", { name: "Close lap simulator" }).click();
  await expect(page.locator(".lap-player")).toHaveCount(0);
  await expect(page).not.toHaveURL(/lap=1/);
  await page.locator("#play-lap").click();
  await expect(page.locator(".lap-loading")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lap-player")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("mobile view scrolls to all car settings without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?track=be-spa-francorchamps&lap=1");
  await expect(page.locator(".lap-loading")).toBeHidden();
  expect(
    await page
      .locator(".lap-player")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.locator("[name=brakingG]").scrollIntoViewIfNeeded();
  await expect(page.locator("[name=brakingG]")).toBeVisible();
  await page.locator("[name=brakingG]").fill("1.0");
  await page.getByRole("button", { name: "Recalculate lap" }).click();
  await expect(page.locator(".lap-status")).toHaveText("Lap recalculated");
});
test("canvas video export creates a downloadable recording", async ({
  page,
}) => {
  await page.goto("/?track=be-spa-francorchamps&lap=1");
  await expect(page.locator(".lap-loading")).toBeHidden();
  await expect(page.locator(".lap-status")).toHaveText("Aerial imagery loaded");
  await page.locator(".lap-record").click();
  await expect(page.locator(".lap-record")).toHaveText("Stop recording");
  await page.waitForTimeout(1200);
  await page.locator(".lap-record").click();
  await expect(page.locator(".lap-download")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.locator(".lap-download").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /be-spa-francorchamps-grand-prix-lap-.*\.(mp4|webm)$/,
  );
});
test("imagery failure leaves the lap usable and explains the missing background", async ({
  page,
}) => {
  await page.route("**/geoservices.wallonie.be/**", (route) => route.abort());
  await page.goto("/?track=be-spa-francorchamps&lap=1");
  await expect(page.locator(".lap-status")).toHaveText(
    /Aerial imagery unavailable/,
  );
  await page.locator(".lap-play").click();
  await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
});

test("one downloaded Spa GeoJSON supplies the lap and terrain without sidecar requests", async ({
  page,
}) => {
  const sidecars: string[] = [];
  page.on("request", (request) => {
    if (
      /\/data\/(simulation\/|elevation\/be-spa-francorchamps\.json)/.test(
        request.url(),
      )
    )
      sidecars.push(request.url());
  });
  await page.goto("/?track=be-spa-francorchamps&lap=1");
  await expect(page.locator(".lap-loading")).toBeHidden();
  await expect(page.locator("[data-duration]")).toHaveText(/^\d+:\d{2}\.\d{2}$/);
  await expect(page.locator(".lap-player")).toHaveAttribute("data-driving-path", "ideal");
  await expect(page.locator(".lap-status")).toHaveText("Aerial imagery loaded");
  const link = await page.locator("#download").getAttribute("href");
  const response = await page.request.get(link!);
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.metadata.model3d.elevation).toHaveLength(19);
  expect(data.metadata.model3d.curbs).toHaveLength(20);
  expect(data.metadata.model3d.terrain.heights).toHaveLength(850);
  expect(sidecars).toEqual([]);
  await page.getByRole("button", { name: "Close lap simulator" }).click();
  await page.locator("#view-3d").click();
  await page.locator(".map-options summary").click();
  await expect(page.locator("#height-scale")).toBeVisible();
});
