// Takes the Chrome Web Store screenshots: loads the real extension into a
// clean Chromium, opens the made-up shop and course pages from demo/, fills in
// a few example notes and saves 1280x800 pictures to screenshots/.
//
// Usage:
//   PLAYWRIGHT_CORE=<path to playwright-core> CHROMIUM=<path to Chromium binary> \
//   node store-assets/make-screenshots.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, '..');
const outDir = path.join(here, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

// The demo pages link to /tea/<name> and /lesson/<n>; any such address serves
// the page it came from, so links work and every item has its own address.
const server = http.createServer((request, response) => {
  const file = request.url.startsWith('/lessons') || request.url.startsWith('/lesson') ? 'lessons.html' : 'shop.html';
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(fs.readFileSync(path.join(here, 'demo', file)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://localhost:${server.address().port}`;

const note = (status, text, title) => ({ status, text, title, page: origin + '/', updated: Date.now() });
const exampleData = {
  'site:localhost': {
    selectors: ['#grid > div.card', '#list > div.lesson'],
    notes: {
      [`u:${origin}/tea/da-hong-pao`]: note('like', 'Smoky. Bitter on the second brew, so keep it short. Buy again', 'Da Hong Pao'),
      [`u:${origin}/tea/tie-guan-yin`]: note('done', '', 'Tie Guan Yin'),
      [`u:${origin}/tea/menghai-shu-2018`]: note('later', 'Get a sample first, not the whole cake', 'Menghai Shu Pu-erh 2018'),
      [`u:${origin}/tea/dian-hong`]: note('dislike', 'Too sweet for me', 'Dian Hong'),
      [`u:${origin}/lesson/1`]: note('done', '', 'Lesson 1. Yin and Yang: the base of the system'),
      [`u:${origin}/lesson/2`]: note('done', '', 'Lesson 2. Five elements and the generating cycle'),
      [`u:${origin}/lesson/3`]: note('done', 'Rewatch from minute 40', 'Lesson 3. The ten heavenly stems'),
      [`u:${origin}/lesson/4`]: note('done', '', 'Lesson 4. The twelve earthly branches'),
      [`u:${origin}/lesson/6`]: note('later', 'Bring my own chart', 'Lesson 6. Reading the charts of participants'),
      [`u:${origin}/lesson/8`]: note('like', '', 'Lesson 8. Combinations and clashes'),
    },
    positions: {},
  },
};

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'list-stickers-shots-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM || undefined,
  headless: false,
  // A 1024x640 window drawn at 1.25x gives 1280x800 pictures in which the
  // stickers are large enough to read in the store's small previews.
  viewport: { width: 1024, height: 640 },
  deviceScaleFactor: 1.25,
  args: ['--headless=new', `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const optionsUrl = `chrome-extension://${new URL(worker.url()).host}/options.html`;
  const options = await context.newPage();
  await options.goto(optionsUrl);
  await options.evaluate((data) => chrome.storage.local.set(data), exampleData);

  const page = await context.newPage();
  const openSticker = (index) =>
    page.evaluate((i) => document.querySelectorAll('list-sticker')[i].shadowRoot.querySelector('button').click(), index);

  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await openSticker(2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '1-shop.png') });

  await page.goto(origin + '/lessons', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await openSticker(2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '2-lessons.png') });

  await options.reload();
  await options.waitForTimeout(500);
  await options.screenshot({ path: path.join(outDir, '3-all-notes.png') });

  const count = await page.evaluate(() => document.querySelectorAll('list-sticker').length);
  console.log(`saved 3 screenshots to ${outDir}; stickers on the lessons page: ${count}`);
} finally {
  await context.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
