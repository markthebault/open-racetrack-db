import { test, expect } from "@playwright/test";
import { borderPairHash } from "../scripts/refine-image-borders";
import type { Position } from "../src/geo";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
for (const [track, layout] of [
  ["ca-canadian-tire-motorsports-park-ddt-78298a58", "ddt-one-kink"],
  ["ca-canadian-tire-motorsports-park-ddt-78298a58", "ddt-two-kinks"],
  ["pe-autodromo-la-chutana-293467712", "main"],
  ["us-iowa-speedway-119238784", "main"],
  ["us-gopro-motorplex-e67c71ed", "gopro-motorplex"],
  ["gb-boyndie-kart-circuit-a57fdbb4", "boyndie-kart-circuit"],
  ["ca-cameron-speedway-kart-circuit-f7997f0a", "historical-southern-course-a"],
  ["ca-cameron-speedway-kart-circuit-f7997f0a", "historical-southern-course-b"],
  ["ca-cameron-speedway-kart-circuit-f7997f0a", "historical-southern-course-c"],
])
  for (const width of [1440, 390])
    test(`${track}/${layout} measured borders retain evidence, playback and a decodable export at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const host of [
        "ws.geoservices.lrc.gov.on.ca",
        "services.nconemap.gov",
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
        "Sparse image measurements",
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
        refinement = d.metadata.borderInference.measurement;
      if (track === "pe-autodromo-la-chutana-293467712")
        expect(refinement.interpolation).toBe("edge-linear-v1");
      if (track === "ca-cameron-speedway-kart-circuit-f7997f0a") {
        expect(refinement.interpolation).toBe("edge-linear-v1");
        expect(refinement.method).toBe("paired-image-edge-anchors-v1");
        expect(d.metadata.borderInference.method).toBe(
          "image-measured-paired-edges-v1",
        );
      }
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
        "Sections between measurements are interpolated",
      );
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
