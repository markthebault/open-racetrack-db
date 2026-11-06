import { test, expect } from "@playwright/test";

test("an unpaired-boundary layout exposes its driving path, plays and records a video", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  for (const host of ["api.maptiler.com", "server.arcgisonline.com"])
    await page.route(`**/${host}/**`, (route) =>
      route.fulfill({
        contentType: "image/png",
        body: image,
        headers: { "access-control-allow-origin": "*" },
      }),
    );
  await page.goto("/?track=jp-osm-226496291&layout=main&lap=1");
  await expect(page.locator(".lap-loading")).toBeHidden();
  await expect(page.locator(".lap-player")).toContainText(
    "cross-sections from the inner boundary",
  );
  await page.locator(".lap-play").click();
  await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
  await page.locator(".lap-play").click();
  await page.locator(".lap-record").click();
  await expect(page.locator(".lap-record")).toHaveText("Stop recording");
  await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
  await expect(page.locator("[data-clock]")).not.toHaveText(/^0:00/);
  await page.locator(".lap-record").click();
  await expect(page.locator(".lap-download")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.locator(".lap-download").click();
  const video = await download;
  expect(video.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  const stream = await video.createReadStream();
  let size = 0;
  for await (const chunk of stream!) size += chunk.length;
  expect(size).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
