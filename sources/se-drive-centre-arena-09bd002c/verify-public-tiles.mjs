// Revisit the ordinary anonymous map. The viewer, rather than a direct WMS export,
// requests the native image tiles. No credentials or request overrides are used.
import console from 'node:console';
import {URL} from 'node:url';
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest = JSON.parse(readFileSync(new URL('./min-karta-import-drive-centre.json', import.meta.url), 'utf8'));
const expected = new Map(manifest.tiles.map(t => [t.url, t.sha256]));
const seen = new Set();
const browser = await chromium.launch({channel: 'chrome'});
try {
  for (const view of manifest.captureViews) {
    const page = await browser.newPage({viewport: view.viewport, deviceScaleFactor: 1});
    const pending = [];
    page.on('response', response => {
      if (expected.has(response.url())) pending.push((async () => {
        if (response.status() !== 200 || !response.headers()['content-type']?.includes('image/png')) throw new Error('Public viewer did not return its expected tile');
        const hash = createHash('sha256').update(await response.body()).digest('hex');
        if (hash !== expected.get(response.url())) throw new Error('Public tile changed: ' + response.url());
        seen.add(response.url());
      })());
    });
    await page.goto(view.sourceUrl, {waitUntil: 'domcontentloaded'});
    await page.getByRole('button', {name: 'Jag samtycker inte', exact: true}).click();
    await page.waitForTimeout(7000);
    await Promise.all(pending);
    console.log(`Ordinary public viewer tile hashes: ${seen.size}/${expected.size}`);
    await page.close();
  }
  if (seen.size !== expected.size) throw new Error(`Expected ${expected.size} native tiles; obtained ${seen.size}`);
  console.log('All public native tile hashes: PASS');
} finally { await browser.close(); }
