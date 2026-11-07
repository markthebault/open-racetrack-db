import { test, expect } from "@playwright/test";

for (const [track, layout] of [
  ["jp-osm-226496291", "main"],
  ["ca-circuit-icar-1043569622", "icar-mirabel"],
  ["ca-strawberry-creek-raceway-2f57a75c", "strawberry-creek-raceway"],
])
  test(`${track}/${layout} exposes its boundary path, plays and records a video`, async ({
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
    await page.goto(`/?track=${track}&layout=${layout}&lap=1`);
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
    const dimensions = await page.locator(".lap-download").evaluate(
      (link) =>
        new Promise<number[]>((resolve, reject) => {
          const video = document.createElement("video"),
            timer = window.setTimeout(
              () => reject(new Error("Recorded video did not decode")),
              10000,
            );
          video.onloadeddata = () => {
            window.clearTimeout(timer);
            resolve([video.videoWidth, video.videoHeight]);
            video.src = "";
          };
          video.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error("Recorded video is invalid"));
          };
          video.preload = "auto";
          video.src = (link as HTMLAnchorElement).href;
        }),
    );
    expect(dimensions).toEqual([1280, 720]);
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
