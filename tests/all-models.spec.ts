import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { indexSchema, type Layout, type Track } from "../schemas/data";
const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));

test("every bordered circuit and layout renders its own on-demand road surface in the UI", async ({
  page,
}) => {
  test.setTimeout(1200000);
  const catalogue = indexSchema.parse(await read("data/index.json"));
  const groups: {
    track: Track;
    layouts: {
      id: string;
      model: NonNullable<Layout["metadata"]["model3d"]>;
    }[];
  }[] = [];
  for (const entry of catalogue.tracks) {
    const track: Track = await read(`data/${entry.file}`),
      layouts = [];
    for (const item of track.layouts)
      if (item.file) {
        const layout: Layout = await read(
          `data/${dirname(entry.file)}/${item.file}`,
        );
        if (layout.features.some((f) => f.properties.role === "inner")) {
          expect(layout.metadata.model3d).toBeTruthy();
          layouts.push({ id: item.id, model: layout.metadata.model3d! });
        }
      }
    if (layouts.length) groups.push({ track, layouts });
  }
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(
    `/?track=${groups[0].track.id}&layout=${groups[0].layouts[0].id}&view=3d&height=1`,
  );
  let checked = 0;
  for (const { track, layouts } of groups) {
    await page.locator(`#venues button[data-track-id="${track.id}"]`).click();
    await expect(page.locator("#selection h2")).toHaveText(track.name);
    for (const selected of layouts) {
      await page.locator("#layout").selectOption(selected.id);
      await expect(page.locator("#message")).toHaveText("Layout ready");
      if (
        (await page.locator("#view-3d").getAttribute("aria-pressed")) !== "true"
      )
        await page.locator("#view-3d").click();
      const view = page.locator("#track-3d");
      await expect(view).toHaveAttribute(
        "data-layout-key",
        `${track.id}/${selected.id}`,
      );
      await expect(view.locator("canvas")).toBeVisible();
      expect(
        Number(await view.getAttribute("data-road-triangles")),
      ).toBeGreaterThan(0);
      await expect(view).toHaveAttribute(
        "data-curb-sections",
        String(selected.model.curbs.length),
      );
      await expect(page.locator("#play-lap")).toHaveText(
        selected.model.kind === "surface" ? "Explore 3D" : "▷ Play lap",
      );
      if (selected.model.kind === "surface")
        await expect(page.locator("#view-notice")).toBeVisible();
      checked++;
      if (checked % 50 === 0)
        console.log(`Rendered ${checked} bordered layouts`);
    }
  }
  console.log(
    `Rendered all ${checked} layouts across ${groups.length} circuits.`,
  );
  expect(errors).toEqual([]);
});
