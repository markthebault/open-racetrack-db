import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
test("every composed network exposes all embedded routes, exact download and usable playback", async ({
  page,
  request,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const host of [
    "api.maptiler.com",
    "server.arcgisonline.com",
    "imagery.nationalmap.gov",
    "data.geopf.fr",
    "www.ign.es",
  ])
    await page.route(`**/${host}/**`, (r) =>
      r.fulfill({
        body: image,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
      }),
    );
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  const index = JSON.parse(await readFile("data/index.json", "utf8"));
  let routes = 0,
    networks = 0;
  for (const entry of index.tracks) {
    const directory = entry.file.slice(0, entry.file.lastIndexOf("/")),
      track = JSON.parse(await readFile(`data/${entry.file}`, "utf8"));
    for (const item of track.layouts) {
      if (!item.file) continue;
      const d = JSON.parse(
        await readFile(`data/${directory}/${item.file}`, "utf8"),
      );
      if (!d.metadata.borderComposition) continue;
      await page.goto(`/?track=${entry.id}&layout=${item.id}&view=3d`);
      await expect(page.locator("#track-3d")).toHaveAttribute(
        "data-layout-key",
        `${entry.id}/${item.id}`,
      );
      await expect(page.locator("#border-toggle")).toBeEnabled();
      await page.locator("#border-toggle").click();
      await expect(page.locator("#border-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const file = await page.locator("#download").getAttribute("href"),
        download = await (await request.get(file!)).json();
      expect(download.metadata.borderComposition).toEqual(
        d.metadata.borderComposition,
      );
      for (const c of d.metadata.borderComposition) {
        await page
          .getByRole("combobox", { name: "Driving route", exact: true })
          .selectOption(c.sourceLayoutId);
        await page
          .getByRole("button", { name: "Play route", exact: false })
          .click();
        await expect(page.locator(".lap-loading")).toBeHidden();
        await expect(page.locator(".lap-player")).toContainText(c.name);
        await expect(page.locator(".lap-record")).toHaveText(
          c.recipe.kind === "run" ? "Record run" : "Record lap",
        );
        await page.locator(".lap-play").click();
        await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
        await page
          .getByRole("button", {
            name:
              c.recipe.kind === "run"
                ? "Close run simulator"
                : "Close lap simulator",
          })
          .click();
        routes++;
      }
      networks++;
    }
  }
  console.log({ networks, routes });
  expect(networks).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
test("Apex default network offers a route on a phone and supports a route deep link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const host of ["api.maptiler.com", "imagery.nationalmap.gov"])
    await page.route(`**/${host}/**`, (r) =>
      r.fulfill({
        body: image,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
      }),
    );
  await page.goto(
    "/?track=us-apex-motor-b7ddcfd3&layout=apex-motor-club-apex-i&view=3d",
  );
  await expect(
    page.getByRole("combobox", { name: "Driving route", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Play route", exact: false }).click();
  await expect(page.locator(".lap-loading")).toBeHidden();
  await expect(page.locator(".lap-player")).toBeVisible();
  await expect(page).toHaveURL(/route=apex-i-straight/);
  await page.reload();
  await expect(page.locator(".lap-loading")).toBeHidden();
  await expect(page.locator(".lap-player")).toBeVisible();
});
