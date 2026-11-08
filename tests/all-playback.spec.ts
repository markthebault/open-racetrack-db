import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type { Layout, Track } from "../schemas/data";

const raster = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// This checks every prepared driving route. Real imagery availability is a separate audit.
test.describe.configure({ mode: "parallel" });
for (const shard of [0, 1]) {
  test(`every prepared driving layout opens and plays, part ${shard + 1} of 2`, async ({ page }, testInfo) => {
    test.setTimeout(1200000);
    const index = JSON.parse(await readFile("data/index.json", "utf8"));
    const layouts: { trackId: string; layoutId: string; file: string; sha256: string; kind: "lap" | "run" }[] = [];
    for (const entry of index.tracks) {
      const track: Track = JSON.parse(await readFile(`data/${entry.file}`, "utf8"));
      for (const item of track.layouts) {
        if (!item.file) continue;
        const file = `${dirname(entry.file)}/${item.file}`;
        const bytes = await readFile(`data/${file}`);
        const layout: Layout = JSON.parse(bytes.toString());
        const model = layout.metadata.model3d;
        if (!model || model.kind === "surface" || layout.metadata.borderComposition) continue;
        layouts.push({ trackId: track.id, layoutId: item.id, file, sha256: sha256(bytes), kind: model.kind ?? "lap" });
      }
    }
    const selected = layouts.filter((_, i) => i % 2 === shard);
    const appOrigin = new URL(testInfo.project.use.baseURL as string).origin;
    await page.route("**/*", (route) => new URL(route.request().url()).origin === appOrigin
      ? route.continue()
      : route.fulfill({ body: raster, contentType: "image/png", headers: { "access-control-allow-origin": "*" } }));
    const errors: string[] = [];
    const checked = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 960 });
    for (const layout of selected) {
      const response = page.waitForResponse((r) => new URL(r.url()).pathname === `/data/${layout.file}`);
      await page.goto(`/?track=${layout.trackId}&layout=${layout.layoutId}&lap=1`);
      expect(sha256(await (await response).body())).toBe(layout.sha256);
      await expect(page.locator(".lap-loading")).toBeHidden();
      await expect(page.locator(".lap-canvas canvas")).toBeVisible();
      await expect(page.locator(".lap-record")).toBeEnabled();
      await expect(page.locator(".lap-record")).toHaveText(layout.kind === "run" ? "Record run" : "Record lap");
      const timeline = page.locator(".lap-timeline input");
      const durationS = Number(await timeline.getAttribute("max"));
      expect(Number.isFinite(durationS) && durationS > 0).toBe(true);
      await timeline.fill(String(Math.floor(durationS * 0.25)));
      const before = await page.locator("[data-clock]").textContent();
      await page.locator(".lap-play").click();
      await expect(page.locator("[data-clock]")).not.toHaveText(before!);
      await page.locator(".lap-play").click();
      expect(Number.isFinite(Number(await page.locator("[data-speed]").textContent()))).toBe(true);
      await page.getByRole("button", { name: layout.kind === "run" ? "Close run simulator" : "Close lap simulator", exact: true }).click();
      await expect(page.locator(".lap-player")).toHaveCount(0);
      checked.push({ ...layout, durationS });
      if (checked.length % 50 === 0) console.log(`Played ${checked.length}/${selected.length} layouts in part ${shard + 1}`);
    }
    expect(checked).toHaveLength(selected.length);
    expect(errors).toEqual([]);
    console.log(`Played all ${checked.length} layouts in part ${shard + 1}`);
    const report = testInfo.outputPath("prepared-playback-coverage.json");
    await writeFile(report, JSON.stringify({ imagery: "mock raster; availability and visual accuracy are not checked", layouts: checked }, null, 2));
    await testInfo.attach("prepared-playback-coverage", { path: report, contentType: "application/json" });
  });
}
