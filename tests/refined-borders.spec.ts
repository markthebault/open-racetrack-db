import { test, expect } from "@playwright/test";
import { borderPairHash } from "../scripts/refine-image-borders";
import type { Position } from "../src/geo";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
for (const [track, layout] of [
  ["us-arizona-motorsports-park-9f848c55", "arizona-motorsports-park"],
  ["us-arroyo-seco-raceway-83871979", "main"],
  ["us-the-ridge-motorsports-park-182180341", "main"],
  ["ca-cayuga-motor-speedway-66930451", "main"],
  ["ca-delaware-speedway-23968411", "main"],
  ["us-nola-motorsports-park-298904844", "main"],
  ["us-nola-motorsports-park-298904844", "north-long-course-2014"],
  ["gb-curborough-68a60e27", "curborough"],
  ["gb-m-sport-proving-ground-fe7c7315", "msport-inner-variant"],
  ["jp-suzuka-circuit-175231434", "main"],
  ["jp-suzuka-circuit-175231434", "suzuka"],
])
  for (const width of [1440, 390])
    test(`${track}/${layout} refined borders retain evidence, playback and a decodable export at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const host of [
        "ws.geoservices.lrc.gov.on.ca",
        "imagery.nationalmap.gov",
        "server.arcgisonline.com",
        "api.maptiler.com",
      ])
        await page.route(`**/${host}/**`, (r) =>
          r.fulfill({
            contentType: "image/png",
            body: image,
            headers: { "access-control-allow-origin": "*" },
          }),
        );
      await page.goto(`/?track=${track}&layout=${layout}&view=3d`);
      await expect(page.locator(".inferred-border-note")).toContainText(
        "Includes measured image corrections",
      );
      await expect(page.locator(".inferred-border-note")).toContainText(
        "unverified",
      );
      await page.locator("#border-toggle").click();
      await expect(page.locator("#border-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const href = await page.locator("#download").getAttribute("href"),
        d = await (await request.get(href!)).json(),
        refinement = d.metadata.borderInference.refinement;
      const edges = Object.fromEntries(
        d.features
          .filter((f: { properties: { role: string } }) =>
            ["inner", "outer"].includes(f.properties.role),
          )
          .map(
            (f: {
              properties: { role: string };
              geometry: { coordinates: Position[] };
            }) => [f.properties.role, f.geometry.coordinates],
          ),
      ) as { inner: Position[]; outer: Position[] };
      expect(borderPairHash(edges)).toBe(refinement.resultSha256);
      expect(
        refinement.patches.some((p: { anchors: { kind: string }[] }) =>
          p.anchors.some((a) => a.kind === "image-measured"),
        ),
      ).toBe(true);
      await page.locator("#play-lap").click();
      await expect(page.locator(".lap-loading")).toBeHidden();
      await expect(page.locator(".lap-evidence").first()).toContainText(
        "Other sections remain automatic estimates",
      );
      if (d.metadata.borderInference.gradeSeparation) {
        const grade = d.metadata.borderInference.gradeSeparation;
        expect(grade.stationCount).toBe(edges.inner.length - 1);
        expect(grade.elevation.anchors.length).toBeLessThan(100);
        expect(d.metadata.borderInference.edgeConvention).toBe(
          "left-right-along-trace",
        );
        await expect(page.locator(".lap-profile-caption")).toContainText(
          "Bridge interpolated",
        );
        await expect(page.locator(".lap-imagery-credit")).toContainText(
          "Road elevations edited from GSI",
        );
      }
      await page.locator(".lap-play").click();
      await expect(page.locator("[data-clock]")).not.toHaveText("0:00.00");
      await page.locator(".lap-play").click();
      await page.locator(".lap-record").click();
      await expect(page.locator("[data-clock]")).toHaveText(/^0:02/, {
        timeout: 10000,
      });
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
              reject(new Error("Invalid recorded video"));
            };
            video.preload = "auto";
            video.src = (link as HTMLAnchorElement).href;
          }),
      );
      expect(dimensions).toEqual([1280, 720]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
