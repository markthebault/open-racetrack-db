/** Re-fetch the reviewed public dataset using an ordinary anonymous browser. */
import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import console from 'node:console';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const review = JSON.parse(await readFile(resolve(root, 'municipal-roads-review.json'), 'utf8'));
const outputFlag = process.argv.indexOf('--output');
if (outputFlag < 0 || !process.argv[outputFlag + 1]) {
  throw new Error('Use --output /path/to/review-directory');
}
const output = resolve(process.argv[outputFlag + 1]);
const browser = await chromium.launch({channel: 'chrome'});
try {
  const page = await browser.newPage();
  await page.goto(review.sourcePage, {waitUntil: 'domcontentloaded', timeout: 20000});
  const response = await page.goto(review.sourceUrl, {waitUntil: 'load', timeout: 30000});
  if (response.status() !== 200) throw new Error(`Public dataset returned ${response.status()}`);
  const data = JSON.parse(await page.locator('body').innerText());
  if (data.type !== 'FeatureCollection' || data.features?.length !== review.featureCount || data.exceededTransferLimit) {
    throw new Error('Road coverage changed or the result is incomplete; review before replacing the snapshot');
  }
  const bytes = JSON.stringify(data, null, 2) + '\n';
  if (createHash('sha256').update(bytes).digest('hex') !== review.sha256) {
    throw new Error('Road snapshot changed; a new source review is required');
  }
  await mkdir(output, {recursive: true});
  await writeFile(resolve(output, review.file), bytes);
  console.log(`Verified ${data.features.length} public road segments`);
} finally {
  await browser.close();
}
