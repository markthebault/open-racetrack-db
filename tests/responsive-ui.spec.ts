import { test, expect } from '@playwright/test';
for (const width of [320, 390, 820, 1440]) {
  test(`map chrome remains outside the interaction surface at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height:900});
    await page.goto('/?track=be-spa-francorchamps');
    await expect(page.locator('#map-name')).toHaveText('Spa-Francorchamps');
    const map = await page.locator('.map-area').boundingBox();
    const toolbar = await page.locator('.stage-toolbar').boundingBox();
    expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(map!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.map-options > summary').click();
    await expect(page.locator('#share-track')).toBeVisible();
    await page.locator('#border-toggle').click();
    await expect(page.locator('#border-toggle')).toHaveAttribute('aria-pressed','true');
    if (width < 1024) {
      await page.locator('#open-browse').click();
      await expect(page.locator('#search')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#search')).not.toBeVisible();
    }
    await page.locator('#view-3d').click();
    await expect(page.locator('#track-3d canvas')).toBeVisible();
  });
}
