// Loads the real extension into a clean Chromium and tries it on a list of
// public sites: right-click an entry of the main list, let the extension guess
// the list, write a note, reload, and see whether the note is still there.
//
// Usage:
//   PLAYWRIGHT_CORE=<path to playwright-core> CHROMIUM=<path to Chromium binary> \
//   node check.mjs <output dir> [site name ...]
//
// Writes <output dir>/results.json and one screenshot per site, with the
// elements taken as list entries outlined in red and the clicked spot in blue.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, '..');
const outDir = path.resolve(process.argv[2] || 'site-check-out');
const only = process.argv.slice(3);
const sites = JSON.parse(fs.readFileSync(path.join(here, 'sites.json'), 'utf8')).filter(
  (site) => !only.length || only.includes(site.name),
);
const WORKERS = 4;
const SITE_TIMEOUT_MS = 90_000;

fs.mkdirSync(outDir, { recursive: true });

// ---------- code that runs inside the tested page ----------

// Chooses where a person would right-click: the title link of the third entry
// of the biggest group of look-alike links outside the site's header and menus.
// Marks that link, and a picture next to it if there is one.
function chooseTargets(hint) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 8 && getComputedStyle(el).visibility !== 'hidden';
  };
  let link = null;
  let groupSize = 0;
  if (hint) {
    const all = [...document.querySelectorAll(hint)].filter(visible);
    groupSize = all.length;
    link = all[Math.min(2, all.length - 1)] || null;
  } else {
    // Title links of one list are built the same way, so links are grouped by
    // how they sit in the page; the group with the most text wins, which keeps
    // tags, menus and page numbers out.
    const chrome = 'header,nav,footer,aside,[role=navigation],[role=banner],[role=contentinfo]';
    const describe = (el) => (el ? el.tagName + '.' + [...el.classList].sort().join('.') : '');
    const groups = new Map();
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.closest(chrome) || !visible(a)) continue;
      const text = a.textContent.replace(/\s+/g, ' ').trim();
      if (text.length < 8) continue;
      const shape = [describe(a), describe(a.parentElement), a.parentElement?.parentElement?.tagName].join(' < ');
      if (!groups.has(shape)) groups.set(shape, new Map());
      const address = a.href.split('#')[0];
      if (!groups.get(shape).has(address)) groups.get(shape).set(address, { a, text });
    }
    let best = null;
    let bestScore = 0;
    for (const group of groups.values()) {
      const entries = [...group.values()];
      if (entries.length < 5) continue;
      const lengths = entries.map((entry) => entry.text.length).sort((x, y) => x - y);
      const score = entries.length * Math.min(lengths[Math.floor(lengths.length / 2)], 60);
      if (score > bestScore) {
        best = entries;
        bestScore = score;
      }
    }
    if (best) {
      groupSize = best.length;
      link = best[Math.min(2, best.length - 1)].a;
    }
  }
  if (!link) return null;
  link.setAttribute('data-check-target', 'link');

  let image = null;
  for (let node = link, i = 0; node && i < 6 && !image; node = node.parentElement, i++) {
    const r = node.getBoundingClientRect();
    if (r.width * r.height > innerWidth * innerHeight * 0.3) break;
    const pictures = [...node.querySelectorAll('img')].filter((img) => {
      const box = img.getBoundingClientRect();
      return box.width > 40 && box.height > 40;
    });
    if (pictures.length > 2) break;
    image = pictures[0] || null;
  }
  if (image) image.setAttribute('data-check-target', 'image');
  return {
    text: link.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
    groupSize,
    hasImage: !!image,
  };
}

function rightClickTarget(name) {
  const el = document.querySelector(`[data-check-target="${name}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  return true;
}

function measure(selectors) {
  const items = [
    ...new Set(
      selectors.flatMap((s) => {
        try {
          return [...document.querySelectorAll(s)];
        } catch {
          return [];
        }
      }),
    ),
  ];
  const median = (numbers) => {
    const sorted = [...numbers].sort((a, b) => a - b);
    return sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0;
  };
  const ownLinks = items.map((el) => {
    const links = el.matches('a[href]') ? [el] : [...el.querySelectorAll('a[href]')];
    return new Set(links.map((a) => a.href.split('#')[0])).size;
  });
  const target = document.querySelector('[data-check-target="link"]');
  // Elements without a note show nothing, so only stickers with a note are looked at.
  const badges = [...document.querySelectorAll('list-sticker')].filter((badge) => badge.shadowRoot?.querySelector('button.filled'));
  let badgesOnScreen = 0;
  let badgesClickable = 0;
  const covering = [];
  for (const badge of badges) {
    const r = badge.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
    const onTop = document.elementFromPoint(x, y);
    // A fixed site header lying over a scrolled list is not the sticker's fault.
    let pinned = false;
    for (let node = onTop; node && !pinned; node = node.parentElement) {
      pinned = ['fixed', 'sticky'].includes(getComputedStyle(node).position);
    }
    if (pinned && onTop !== badge) continue;
    // The sticker editor the check itself has just opened.
    if (onTop?.tagName === 'LIST-STICKER-UI') continue;
    badgesOnScreen++;
    if (r.width > 0 && onTop === badge) badgesClickable++;
    else if (covering.length < 3) {
      covering.push(
        (onTop ? onTop.tagName.toLowerCase() + '.' + [...onTop.classList].join('.').slice(0, 50) : 'ничего') +
          (onTop && badge.parentElement.contains(onTop) ? ' (внутри того же элемента)' : ' (снаружи)') +
          ` кнопка ${Math.round(r.width)}x${Math.round(r.height)}`,
      );
    }
  }
  for (const el of items) el.style.outline = '3px solid red';
  if (target) target.style.outline = '3px solid blue';
  const panel = document.querySelector('list-sticker-ui')?.shadowRoot?.querySelector('.panel');
  return {
    items: items.length,
    nested: items.filter((a) => items.some((b) => a !== b && a.contains(b))).length,
    targetInside: !!target && items.some((el) => el.contains(target)),
    medianWidth: median(items.map((el) => el.getBoundingClientRect().width)),
    medianHeight: median(items.map((el) => el.getBoundingClientRect().height)),
    medianLinks: median(ownLinks),
    withoutLinks: ownLinks.filter((n) => n === 0).length,
    badges: document.querySelectorAll('list-sticker').length,
    badgesOnScreen,
    badgesClickable,
    covering,
    editorOpen: !!panel,
    editorTitle: panel?.querySelector('.title')?.textContent.slice(0, 80) || '',
  };
}

function writeNote(text) {
  const panel = document.querySelector('list-sticker-ui')?.shadowRoot?.querySelector('.panel');
  if (!panel) return false;
  panel.querySelector('.statuses button[data-status="done"]').click();
  const textarea = panel.querySelector('textarea');
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function closeEditor() {
  document.querySelector('list-sticker-ui')?.shadowRoot?.querySelector('.panel .close')?.click();
}

function countNoteBadges() {
  return [...document.querySelectorAll('list-sticker')].filter((badge) =>
    badge.shadowRoot?.querySelector('button.note'),
  ).length;
}

// ---------- driving the browser ----------

async function checkSite(site, page, control) {
  const result = { name: site.name, kind: site.kind, url: site.url };
  const storageKey = () => 'site:' + new URL(page.url()).hostname;
  const readSite = async () =>
    (await control.evaluate(async (key) => (await chrome.storage.local.get(key))[key], storageKey())) ||
    { selectors: [], notes: {} };
  // The extension's menu item cannot be clicked by automation, so the test
  // sends the same message the menu item sends.
  const chooseMenuItem = () =>
    control.evaluate(async () => {
      for (const tab of await chrome.tabs.query({})) {
        chrome.tabs.sendMessage(tab.id, { type: 'sticker-at-right-click' }).catch(() => {});
      }
    });

  let response;
  try {
    response = await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  } catch (error) {
    return { ...result, verdict: 'untestable', why: 'страница не открылась: ' + error.message.split('\n')[0] };
  }
  await page.waitForTimeout(4000);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1500);

  const status = response?.status() ?? 0;
  const title = await page.title();
  const linkCount = await page.evaluate(() => document.querySelectorAll('a[href]').length);
  if (
    status >= 400 ||
    linkCount < 15 ||
    /captcha|access denied|just a moment|are you a robot|attention required|verify you are|робот|доступ ограничен/i.test(title)
  ) {
    return { ...result, verdict: 'untestable', why: `сайт не пустил автоматический браузер (код ${status}, заголовок «${title.slice(0, 60)}», ссылок ${linkCount})` };
  }

  result.target = await page.evaluate(chooseTargets, site.hint || null);
  if (!result.target) {
    return { ...result, verdict: 'untestable', why: 'проверка не нашла на странице, куда кликнуть' };
  }

  // First through the picture, only to see whether it leads to the same list.
  if (result.target.hasImage) {
    await page.evaluate(rightClickTarget, 'image');
    await chooseMenuItem();
    await page.waitForTimeout(1200);
    result.selectorFromImage = (await readSite()).selectors[0] || null;
    await page.evaluate(closeEditor);
    await control.evaluate((key) => chrome.storage.local.remove(key), storageKey());
    await page.waitForTimeout(600);
  }

  await page.evaluate(rightClickTarget, 'link');
  await chooseMenuItem();
  await page.waitForTimeout(1200);
  const saved = await readSite();
  result.selector = saved.selectors[0] || null;
  if (!result.selector) {
    await page.screenshot({ path: path.join(outDir, site.name + '.jpg'), type: 'jpeg', quality: 55 });
    return { ...result, verdict: 'fail', why: 'расширение не нашло список' };
  }

  Object.assign(result, await page.evaluate(measure, saved.selectors));
  result.noteWritten = await page.evaluate(writeNote, 'проверка стикера');
  await page.waitForTimeout(900);
  const noteKeys = Object.keys((await readSite()).notes);
  result.noteSaved = noteKeys.length === 1;
  result.noteKey = noteKeys[0] || null;
  result.keyKind = { u: 'адрес', i: 'идентификатор', t: 'название' }[noteKeys[0]?.[0]] || null;
  await page.evaluate(closeEditor);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, site.name + '.jpg'), type: 'jpeg', quality: 55 });

  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 40_000 });
  } catch {
    // Judged below by whether the note shows up.
  }
  result.noteAfterReload = 0;
  for (let attempt = 0; attempt < 6 && !result.noteAfterReload; attempt++) {
    await page.waitForTimeout(2000);
    await page.mouse.wheel(0, 300);
    result.noteAfterReload = await page.evaluate(countNoteBadges).catch(() => 0);
  }

  result.itemsAfterReload = await page
    .evaluate((selectors) => selectors.reduce((n, s) => n + document.querySelectorAll(s).length, 0), saved.selectors)
    .catch(() => -1);
  result.linksOfFirstItemsAfterReload = await page
    .evaluate((selectors) => [...document.querySelectorAll(selectors[0])].slice(0, 3).map((el) => (el.matches('a[href]') ? el : el.querySelector('a[href]'))?.href || null), saved.selectors)
    .catch(() => []);

  const problems = [];
  if (result.items < 3) problems.push('элементов меньше трёх');
  if (!result.targetInside) problems.push('место клика не попало ни в один элемент');
  if (result.nested) problems.push('элементы вложены друг в друга');
  if (result.withoutLinks / result.items > 0.2) problems.push(`у ${result.withoutLinks} из ${result.items} элементов нет ни одной ссылки`);
  if (result.badgesOnScreen && result.badgesClickable / result.badgesOnScreen < 0.8) problems.push('кнопки стикеров чем-то перекрыты');
  if (!result.editorOpen) problems.push('стикер не открылся');
  if (!result.noteSaved) problems.push('заметка не сохранилась');
  if (result.noteAfterReload < 1) problems.push(`после перезагрузки заметка пропала (элементов списка найдено: ${result.itemsAfterReload})`);
  if (result.target.hasImage && result.selectorFromImage !== result.selector) problems.push('клик по картинке дал другой список, чем клик по названию');
  if (result.keyKind === 'название') problems.push('привязка по названию, а не по адресу');
  result.problems = problems;
  result.verdict = problems.length ? 'check' : 'ok';
  return result;
}

async function worker(index, queue, results) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'list-stickers-check-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROMIUM || undefined,
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });
  try {
    const serviceWorker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(serviceWorker.url()).host;
    const control = await context.newPage();
    await control.goto(`chrome-extension://${extensionId}/options.html`);
    while (queue.length) {
      const site = queue.shift();
      const page = await context.newPage();
      let result;
      try {
        result = await Promise.race([
          checkSite(site, page, control),
          new Promise((_, reject) => setTimeout(() => reject(new Error('слишком долго')), SITE_TIMEOUT_MS)),
        ]);
      } catch (error) {
        result = { name: site.name, kind: site.kind, url: site.url, verdict: 'untestable', why: 'проверка сорвалась: ' + error.message.split('\n')[0] };
      }
      await page.close().catch(() => {});
      results.push(result);
      console.log(`${result.verdict.padEnd(10)} ${result.name.padEnd(22)} ${result.why || (result.problems || []).join('; ')}`);
    }
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

const queue = [...sites];
const results = [];
await Promise.all(Array.from({ length: Math.min(WORKERS, sites.length) }, (_, i) => worker(i, queue, results)));
results.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
const count = (verdict) => results.filter((r) => r.verdict === verdict).length;
console.log(`\nвсего ${results.length}: ok ${count('ok')}, check ${count('check')}, fail ${count('fail')}, untestable ${count('untestable')}`);
