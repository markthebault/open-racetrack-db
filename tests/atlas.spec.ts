import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

const fingerprint = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

test("a local timing preview follows terrain while the public download retains the full original course", async ({
  page,
  request,
}) => {
  const source = JSON.parse(
    await readFile(
      "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
      "utf8",
    ),
  );
  const points = source.features[0].geometry.coordinates;
  const timing = {
    "be-spa-francorchamps/grand-prix": {
      name: "Test preview",
      gates: [
        { role: "start", point: points[Math.floor(points.length * 0.2)] },
        { role: "finish", point: points[Math.floor(points.length * 0.65)] },
      ],
    },
  };
  await page.route("**/local/timing.json", (route) =>
    route.fulfill({ json: timing }),
  );
  await page.goto("/?track=be-spa-francorchamps&layout=grand-prix&view=3d");
  await expect(page.locator("#track-3d canvas")).toBeVisible();
  await expect(page.locator("#elevation-profile")).toBeVisible();
  await expect(
    page.locator('#track-3d .timing-label[data-role="start"] strong'),
  ).toHaveText("Start");
  await expect(
    page.locator('#track-3d .timing-label[data-role="finish"] strong'),
  ).toHaveText("Finish");
  await expect(page.locator("#track-3d .timing-label > span")).toHaveText([
    "Estimated position",
    "Estimated position",
  ]);
  // Check the rendered canvas too: text badges alone cannot prove the lines are drawn.
  const pixels = PNG.sync.read(
    await page.locator("#track-3d canvas").screenshot(),
  );
  let green = 0,
    red = 0;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const [r, g, b, a] = pixels.data.subarray(i, i + 4);
    if (a > 100 && g > 170 && g - r > 60 && b - r > 35) green++;
    if (a > 100 && r > 220 && g < 180 && b > 100 && b > g * 0.95) red++;
  }
  expect(green).toBeGreaterThan(0);
  expect(red).toBeGreaterThan(0);
  await page.locator(".track-notes > summary").click();
  await expect(page.locator(".notes-content")).toContainText(
    "Preview trace trimmed",
  );
  await expect(page.locator(".notes-content")).toContainText(
    "Local reference timing is excluded",
  );
  const file = await page.locator("#download").getAttribute("href");
  expect(await (await request.get(file!)).json()).toEqual(source);
  await page.locator("#view-2d").click();
  await expect(
    page.getByText("Start · Estimated position", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Finish · Estimated position", { exact: true }),
  ).toBeVisible();
});

test("shared timing markers stay visible on phones, follow orbiting and clear with the selected course", async ({
  page,
}) => {
  const source = JSON.parse(
    await readFile(
      "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
      "utf8",
    ),
  );
  const points = source.features[0].geometry.coordinates;
  await page.route("**/local/timing.json", (route) =>
    route.fulfill({
      json: {
        "be-spa-francorchamps/grand-prix": {
          name: "Test shared line",
          gates: [
            {
              role: "start_finish",
              point: points[Math.floor(points.length * 0.25)],
            },
          ],
        },
      },
    }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?track=be-spa-francorchamps&view=3d");
  const label = page.locator(
    '#track-3d .timing-label[data-role="start_finish"]',
  );
  await expect(label.locator("strong")).toHaveText("Start / finish");
  await expect(label.locator("span")).toHaveText("Estimated position");
  await expect(label).toBeInViewport();
  const before = await label.boundingBox();
  await page.locator("#track-3d canvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => Math.abs((await label.boundingBox())!.x - before!.x))
    .toBeGreaterThan(1);
  await page.locator("#height-scale").click();
  await expect(label).toBeVisible();
  await expect(label).toBeInViewport();
  await page.locator("#open-browse").click();
  await page.locator("#search").fill("Hockenheim");
  await page.locator("#venues button").click();
  await expect(page.locator("#message")).toHaveText("Layout ready");
  await expect(page.locator("#track-3d .timing-label")).toHaveCount(0);
});

test("losing the graphics context falls back to the usable 2D course", async ({
  page,
}) => {
  await page.goto("/?track=be-spa-francorchamps&view=3d");
  const canvas = page.locator("#track-3d canvas");
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element) => {
    (element as HTMLCanvasElement)
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext();
  });
  await expect(page.locator("#view-notice")).toContainText("3D is unavailable");
  await expect(page.locator("#map")).toBeVisible();
  await expect(page.locator("#download")).toBeVisible();
});

test("terrain is served statically and height exaggeration changes the model without changing measured heights or GeoJSON", async ({
  page,
}) => {
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto("/?track=be-spa-francorchamps&view=3d");
  const canvas = page.locator("#track-3d canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator("#elevation-profile")).toBeVisible();
  const relief = await page.locator("#elevation-range").textContent();
  expect(parseInt(relief!)).toBeGreaterThan(80);
  const profile = await page.locator("#elevation-profile").innerHTML();
  const download = await page.locator("#download").getAttribute("href");
  const exaggerated = fingerprint(await canvas.screenshot());
  await page.locator("#height-scale").click();
  await expect(page.locator("#height-scale")).toContainText("1×");
  await expect(page.locator("#height-scale")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect
    .poll(async () => fingerprint(await canvas.screenshot()))
    .not.toBe(exaggerated);
  await expect(page.locator("#elevation-range")).toHaveText(relief!);
  expect(await page.locator("#elevation-profile").innerHTML()).toBe(profile);
  await expect(page.locator("#download")).toHaveAttribute("href", download!);
  await expect(page).toHaveURL(/height=1/);
  await page.reload();
  await expect(page.locator("#height-scale")).toContainText("1×");
  await expect(page.locator("#elevation-range")).toHaveText(relief!);
  await page.locator(".track-notes > summary").click();
  await page.locator(".elevation-sources > summary").click();
  await expect(page.locator(".elevation-sources")).toContainText(
    "not a survey",
  );
});

test("a missing elevation file keeps the course usable and clearly labels the flat fallback", async ({
  page,
}) => {
  await page.route("**/data/elevation/*.json", (route) =>
    route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await page.goto("/?track=be-spa-francorchamps&view=3d");
  await expect(page.locator("#track-3d canvas")).toBeVisible();
  await expect(page.locator("#model-note")).toHaveText(
    "Mapped course · Elevation unavailable",
  );
  await expect(page.locator("#height-scale")).not.toBeVisible();
  await expect(page.locator("#elevation-profile")).toHaveCount(0);
  await expect(page.locator("#download")).toBeVisible();
  await page.locator("#view-2d").click();
  await expect(page.locator("#map")).toBeVisible();
});

test("the 3D course renders, responds to controls, and shares an exact layout without changing its download", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?track=de-hockenheimring&layout=grand-prix&view=3d");
  await expect(page.locator("#message")).toHaveText("Layout ready");
  const canvas = page.locator("#track-3d canvas");
  await expect(canvas).toBeVisible();
  const before = fingerprint(await canvas.screenshot());
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => fingerprint(await canvas.screenshot()))
    .not.toBe(before);
  await page.locator("#layout").selectOption("short");
  await expect(page.locator("#message")).toHaveText("Layout ready");
  await expect(page.locator("#view-3d")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page).toHaveURL(/layout=short.*view=3d/);
  const file = await page.locator("#download").getAttribute("href");
  const data = await (await request.get(file!)).json();
  expect(data.metadata.layoutId).toBe("short");
  expect(data.features[0].geometry.coordinates[0]).toHaveLength(2);
  await page.locator("#share-track").click();
  await expect(page.locator("#share-url")).toHaveValue(page.url());
  await page.keyboard.press("Escape");
  await expect(page.locator("#share-dialog")).not.toBeVisible();
  await page.locator("#view-2d").click();
  await expect(canvas).not.toBeVisible();
  await expect(page.locator("#map")).toBeVisible();
  await expect(page.locator("#download")).toHaveAttribute("href", file!);
  await page.goBack();
  await expect(canvas).toBeVisible();
  await expect(page.locator("#layout")).toHaveValue("short");
  expect(errors).toEqual([]);
});

test("saved tracks and the last visited layout survive returning to the atlas", async ({
  page,
}) => {
  await page.goto("/?track=de-hockenheimring&layout=short&view=3d");
  await expect(page.locator("#message")).toHaveText("Layout ready");
  await page.locator("#save-track").click();
  await expect(page.locator("#save-track")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/");
  await expect(page.locator("#layout")).toHaveValue("short");
  await expect(page.locator("#view-2d")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#track-3d canvas")).not.toBeVisible();
  await page.locator("#saved-tracks").click();
  await expect(page.locator("#count")).toHaveText("1 track");
  await expect(page.locator("#venues button")).toHaveCount(1);
  await expect(page.locator("#venues")).toContainText("Hockenheimring");
  await page.locator("#save-track").click();
  await expect(page.locator("#venues")).toContainText("Nothing saved yet.");
  await page.reload();
  await expect(page.locator("#saved-count")).toHaveText("0");
});

test("browsing works with unavailable tiles, disabled storage and unsupported WebGL", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/?track=be-spa-francorchamps&view=3d");
  await expect(page.locator("#view-notice")).toContainText("3D is unavailable");
  await expect(page.locator("#map")).toBeVisible();
  await expect(page.locator("#view-3d")).toBeDisabled();
  await expect(page.locator("#download")).toBeVisible();
  await page.locator("#save-track").click();
  await expect(page.locator("#saved-count")).toHaveText("1");
  await page.locator("#search").fill("Suzuka");
  await expect(page.locator("#venues")).toContainText("Suzuka Circuit");
  await page
    .locator("#venues button")
    .filter({ hasText: "Suzuka Circuit" })
    .click();
  await expect(page.locator("#message")).toHaveText("Layout ready");
});

test("keyboard search preserves the selected track while filtering and empty results are recoverable", async ({
  page,
}) => {
  await page.goto("/?track=be-spa-francorchamps");
  await expect(page.locator("#message")).toHaveText("Layout ready");
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
  await page.locator("#search").fill("nurburgring");
  await expect(page.locator("#count")).toHaveText("1 track");
  await expect(page.locator("#selection h2")).toHaveText(
    "Circuit de Spa-Francorchamps",
  );
  await page.locator("#search").fill("no-such-racetrack-123");
  await expect(page.locator("#venues")).toContainText("No tracks found.");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("#venues button").first()).toBeVisible();
});

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`phone browsing, 3D and downloads work at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("#message")).toHaveText("Layout ready");
    await expect(page.locator("#view-2d")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#view-3d").click();
    await expect(page.locator("#track-3d canvas")).toBeVisible();
    await expect(page.locator("#map-name")).toBeInViewport();
    await expect(page.locator("#open-browse")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.locator("#open-browse").click();
    await expect(page.locator("#search")).toBeFocused();
    await page.locator("#search").fill("Monza");
    await expect(page.locator("#venues button")).toHaveCount(1);
    await page.locator("#venues button").click();
    await expect(page.locator("#catalogue-panel")).not.toBeVisible();
    await expect(page.locator("#selection h2")).toHaveText(
      "Autodromo Nazionale Monza",
    );
    await expect(page.locator("#download")).toBeVisible();
    await page.locator("#view-2d").click();
    await expect(page.locator("#map")).toBeVisible();
    await page.locator("#open-browse").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#open-browse")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });
}

test("desktop and phone controls pass automated accessibility checks", async ({
  page,
}) => {
  await page.goto("/?track=be-spa-francorchamps&view=3d");
  await expect(page.locator("#track-3d canvas")).toBeVisible();
  const audit = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
  expect((await audit()).violations).toEqual([]);
  await page.locator("#view-2d").click();
  expect((await audit()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#open-browse").click();
  await expect(page.locator("#search")).toBeFocused();
  expect((await audit()).violations).toEqual([]);
});
