import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildRoad } from "../src/lap-simulation";

const track = "gb-castle-combe-circuit-35406015", layout = "castle-combe-western-sprint",
  bytes = readFileSync("data/united-kingdom/castle-combe-circuit-35406015/layouts/castle-combe-western-sprint.geojson"),
  road = buildRoad(JSON.parse(bytes.toString()));

for (const width of [1440, 390, 320])
  test(`complete Western Sprint road, approach borders and playback at ${width}px`, async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await page.goto(`/?track=${track}&layout=${layout}&view=3d&height=1`);
    await expect(page.locator("#track-3d")).toHaveAttribute("data-layout-key", `${track}/${layout}`);
    await expect(page.locator("#track-3d")).toHaveAttribute("data-road-triangles", String(road.renderSegmentCount! * 2));
    await expect(page.locator(".inferred-border-note")).toContainText("approach limits");
    await page.locator("#view-satellite").click();
    await expect(page.locator("#view-satellite")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#border-toggle").click();
    await expect(page.locator("#border-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".border-inner")).toBeVisible();
    await expect(page.locator(".border-outer")).toBeVisible();
    await page.locator("#view-3d").click();
    const href = await page.locator("#download").getAttribute("href");
    expect(await (await request.get(href!)).body()).toEqual(bytes);
    await page.locator("#play-lap").click();
    await expect(page.locator(".lap-loading")).toBeHidden();
    await expect(page.locator(".lap-status")).toHaveText("Aerial imagery loaded", { timeout: 45000 });
    await expect(page.locator("[data-source-credit]")).toContainText("LicenseRef-Track-Borders");
    await expect(page.locator("[data-source-credit]")).toContainText("LicenseRef-MapTiler-Derived-Borders");
    await expect(page.locator(".lap-evidence").first()).toContainText("Pit-exit approach limits");
    await expect(page.locator("[data-elevation-note]")).toContainText("complete saved source sequence");
    await page.locator(".lap-timeline input").fill("130");
    await expect(page.locator("[data-clock]")).toHaveText("2:10.00");
    await page.locator(".lap-play").click();
    await expect(page.locator("[data-clock]")).not.toHaveText("2:10.00");
    await page.screenshot({ path: `.local/coverage-goal/western-sprint-ui-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.getByRole("button", { name: "Close run simulator", exact: true }).click();
    expect(errors).toEqual([]);
  });
