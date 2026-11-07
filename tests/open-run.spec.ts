import { test, expect } from "@playwright/test";
// Use the common valid placeholder image; image availability must not gate road playback.
const placeholder = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
test("open routes expose left/right edges and stop at the finish, with video export", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const host of [
    "api.maptiler.com",
    "imagery.nationalmap.gov",
    "opendata.lgln.niedersachsen.de",
  ])
    await page.route(`**/${host}/**`, (r) =>
      r.fulfill({
        body: placeholder,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
      }),
    );
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  for (const [track, layout] of [
    ["cy-achna-speedway-ab0bcabd", "achna-inner-alternative"],
    ["us-va-city-hill-climb-8d49ea09", "va-city-hill-climb"],
    ["gb-bucks-estate-sprint-45ee8814", "bucks-estate-sprint"],
    ["gb-curborough-68a60e27", "curborough"],
    ["gb-loton-hillclimb-2b41199e", "loton-hillclimb"],
    ["de-osnabruck-hill-climb-d7c0b8d4", "osnabruck-hill-climb"],
  ]) {
    await page.goto(`/?track=${track}&layout=${layout}&view=3d`);
    await expect(page.locator("#play-lap")).toHaveText("▷ Play run");
    await expect(page.locator("#border-toggle")).toHaveText(
      "Left & right lines",
    );
    await page.locator("#play-lap").click();
    await expect(page.locator(".lap-loading")).toBeHidden();
    await expect(page.locator(".lap-play")).toHaveText("Play run");
    await expect(page.locator(".lap-record")).toHaveText("Record run");
    await expect(page.locator("[data-clock]")).toHaveText("0:00.00");
    await expect(page.locator("[data-solver-note]")).toContainText(
      "standing-start run",
    );
    if (track.startsWith("gb-bucks")) {
      await page.locator(".lap-record").click();
      await expect(page.locator(".lap-download")).toBeVisible({
        timeout: 60000,
      });
      await expect(page.locator(".lap-play")).toHaveText("Play run");
      const size = await page.locator(".lap-download").evaluate(async (a) => {
        const blob = await (await fetch((a as HTMLAnchorElement).href)).blob();
        return blob.size;
      });
      expect(size).toBeGreaterThan(1000);
    } else {
      await page.locator(".lap-play").click();
      await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
      await page.locator(".lap-play").click();
      await page.locator(".lap-timeline input").evaluate((el) => {
        const input = el as HTMLInputElement;
        input.value = input.max;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await expect(page.locator(".lap-play")).toHaveText("Play run");
    }
    await page.getByRole("button", { name: "Close run simulator" }).click();
  }
  expect(errors).toEqual([]);
});

test("point-to-point playback remains usable on a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const host of ["api.maptiler.com", "imagery.nationalmap.gov"])
    await page.route(`**/${host}/**`, (r) =>
      r.fulfill({
        body: placeholder,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
      }),
    );
  await page.goto(
    "/?track=gb-bucks-estate-sprint-45ee8814&layout=bucks-estate-sprint&lap=1",
  );
  await expect(page.locator(".lap-loading")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Play run", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Record run", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const slider = page.getByRole("slider", { name: "Run time", exact: true });
  await slider.focus();
  await page.keyboard.press("End");
  const times = (await page.locator("[data-lap-time]").innerText())
    .split("/")
    .map((s) => s.trim());
  expect(times[0]).toBe(times[1]);
  await page.getByRole("button", { name: "Close run simulator" }).click();
});
