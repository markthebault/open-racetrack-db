import { test, expect } from "@playwright/test";
test.use({ actionTimeout: 15000 });
test.beforeEach(async ({ page }) => {
  const base = new URL(
    process.env.RACETRACK_TEST_URL ?? "http://127.0.0.1:5190",
  ).origin;
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort(),
  );
});
const ready = async (page: any) =>
  expect(page.locator("#message")).toHaveText("Layout ready", {
    timeout: 60000,
  });
const tools = async (page: any) => {
  if (!(await page.locator(".map-options").evaluate((e: any) => e.open)))
    await page.locator(".map-options > summary").click();
};
const zoomIn = async (page: any) => {
  const before = await page.locator(".leaflet-proxy").getAttribute("style");
  await page.locator("#zoom-in").click();
  await expect(page.locator(".leaflet-proxy")).not.toHaveAttribute(
    "style",
    before!,
  );
  await page.waitForFunction(
    () => !document.querySelector(".leaflet-zoom-anim"),
  );
};
test("Map and Satellite retain the zoom and panned position", async ({
  page,
}) => {
  await page.goto("/?track=be-spa-francorchamps&layout=grand-prix");
  await ready(page);
  await zoomIn(page);
  await zoomIn(page);
  const box = (await page.locator("#map").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * 0.5 + 65,
    box.y + box.height * 0.5 + 45,
    { steps: 5 },
  );
  await page.mouse.up();
  // Leaflet's proxy transform encodes the projected centre and zoom scale.
  const before = await page.locator(".leaflet-proxy").getAttribute("style");
  expect(before).toBeTruthy();
  await page.locator("#view-satellite").click();
  await expect(page.locator("#view-satellite")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".leaflet-proxy")).toHaveAttribute(
    "style",
    before!,
  );
  await page.locator("#view-2d").click();
  await expect(page.locator(".leaflet-proxy")).toHaveAttribute(
    "style",
    before!,
  );
});
test("uncertain data stays disabled, with an explicit user width override and conditional disclaimer", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?track=au-albert-park-3785d160&layout=albert-park");
  await ready(page);
  await tools(page);
  await expect(page.locator("#border-toggle")).toBeDisabled();
  await expect(page.locator("#ideal-toggle")).toBeVisible();
  await expect(page.locator("#ideal-toggle")).toBeDisabled();
  await expect(page.locator("#manual-width-controls")).toBeVisible();
  await expect(page.locator("#line-disclaimer")).toBeHidden();
  await zoomIn(page);
  const calculationView = await page
    .locator(".leaflet-proxy")
    .getAttribute("style");
  await page.locator("#manual-road-width").fill("9.5");
  await page
    .getByRole("button", { name: "Calculate lines", exact: true })
    .click();
  await ready(page);
  await expect(page.locator("#border-toggle")).toBeEnabled();
  await expect(page.locator("#ideal-toggle")).toBeEnabled();
  await expect(page.locator(".leaflet-proxy")).toHaveAttribute(
    "style",
    calculationView!,
  );
  await expect(page.locator("#border-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#ideal-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".track-border")).toHaveCount(2);
  await expect(page.locator(".ideal-line")).toHaveCount(1);
  const previousLine = await page.locator(".ideal-line").getAttribute("d");
  await page.locator("#manual-road-width").fill("10.5");
  await page
    .getByRole("button", { name: "Calculate lines", exact: true })
    .click();
  await expect(page.locator("#manual-width-controls")).toBeVisible();
  await expect(page.locator("#manual-width-controls")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator(".ideal-line")).toHaveAttribute("d", previousLine!);
  await ready(page);
  await expect(page.locator(".leaflet-proxy")).toHaveAttribute(
    "style",
    calculationView!,
  );
  await expect(page.locator("#line-disclaimer")).toBeVisible();
  await expect(page.locator("#line-disclaimer")).toContainText(
    "estimated track boundaries",
  );
  await page.locator("#border-toggle").click();
  await expect(page.locator("#line-disclaimer")).toBeVisible();
  await page.locator("#ideal-toggle").click();
  await expect(page.locator("#line-disclaimer")).toBeHidden();
  await page.locator("#manual-width-reset").click();
  await ready(page);
  await expect(page.locator("#border-toggle")).toBeDisabled();
  await expect(page.locator("#ideal-toggle")).toBeDisabled();
  const href = (await page.locator("#download").getAttribute("href"))!;
  const data = await (await request.get(href)).json();
  expect(
    data.features.some((f: any) =>
      ["inner", "outer", "ideal"].includes(f.properties.role),
    ),
  ).toBe(false);
  const track = await (
    await request.get("/data/australia/au-albert-park-3785d160/track.json")
  ).json();
  expect(track.layouts[0].roadWidthM).toBeUndefined();
  expect(track.layouts[0].lineUnavailableReason).toBeTruthy();
  expect(errors).toEqual([]);
});
test("Surprise and world overview ignore the name search; zooming loads clickable outlines", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?track=be-spa-francorchamps&layout=grand-prix");
  await ready(page);
  await page.locator("#country").selectOption("MZ");
  await page.locator("#search").fill("no-such-track-zzzz");
  await page.locator("#surprise").click();
  await ready(page);
  await expect(page.locator("#search")).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("track")).toContain(
    "autodromo-atcm",
  );
  await page.locator("#search").fill("no-such-track-zzzz");
  await page.locator("#world-map").click();
  await expect(page.locator("#search")).toHaveValue("");
  await expect(page.locator("#map-name")).toHaveText("Explore the world.");
  for (let i = 0; i < 3; i++) await zoomIn(page);
  await expect(page.locator(".world-track-outline").first()).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator("#map-name")).toHaveText("Explore the world.");
  const worldView = await page.locator(".leaflet-proxy").getAttribute("style");
  const target = await page
    .locator(".world-track-outline")
    .first()
    .evaluate((el: any) => {
      const p = el.getPointAtLength(el.getTotalLength() * 0.35);
      const m = el.getScreenCTM();
      return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
    });
  await page.mouse.click(target.x, target.y);
  await ready(page);
  expect(new URL(page.url()).searchParams.get("track")).toContain(
    "autodromo-atcm",
  );
  await page.goBack();
  await expect(page.locator("#map-name")).toHaveText("Explore the world.");
  await expect(page.locator(".leaflet-proxy")).toHaveAttribute(
    "style",
    worldView!,
  );
  await page.mouse.click(target.x, target.y);
  await ready(page);
  await page.locator("#world-map").click();
  await expect(page.locator(".leaflet-proxy")).toHaveAttribute(
    "style",
    worldView!,
  );
  await page.locator("#country").selectOption("");
  await page.locator("#world-map").click();
  const index = await (await request.get("/data/index.json")).json();
  await expect(page.locator(".world-track-pin")).toHaveCount(
    index.tracks.filter((t: any) => t.location).length,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("a failed width recalculation keeps the previous visible result and viewport", async ({
  page,
}) => {
  await page.goto("/?track=au-albert-park-3785d160&layout=albert-park");
  await ready(page);
  await tools(page);
  await page.locator("#manual-road-width").fill("9.5");
  await page
    .getByRole("button", { name: "Calculate lines", exact: true })
    .click();
  await ready(page);
  const path = await page.locator(".ideal-line").getAttribute("d"),
    view = await page.locator(".leaflet-proxy").getAttribute("style");
  await page.route("**/trace-width.worker-*.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'self.onmessage=()=>self.postMessage({ok:false,error:"Forced regression failure"});',
    }),
  );
  await page.locator("#manual-road-width").fill("10.5");
  await page
    .getByRole("button", { name: "Calculate lines", exact: true })
    .click();
  await expect(page.locator("#manual-width-status")).toContainText(
    "Previous view kept",
  );
  await expect(page.locator(".ideal-line")).toHaveAttribute("d", path!);
  await expect(page.locator(".leaflet-proxy")).toHaveAttribute("style", view!);
  await expect(
    page.getByRole("button", { name: "Calculate lines", exact: true }),
  ).toBeEnabled();
});
