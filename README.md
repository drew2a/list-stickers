# List Stickers

A Chrome extension that lets you stick a private note on any item of any list
on the web: a tea in a shop, a lesson in a course archive, an article in a feed.

Each sticker holds a one-click status and a free-text note:

| Status | Meaning |
|---|---|
| ✅ | Done: watched, read or tried |
| 👍 | Like |
| 👎 | Dislike |
| 🕒 | For later |

Stickers come back after a reload and follow the item when the list is
re-sorted, filtered or grows. Everything is kept in this browser only; nothing
is sent anywhere.

## Install

The extension is not in the Chrome Web Store; it is loaded from this folder.

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this folder.
4. Reload the tabs that were already open.

After the code in this folder changes, click the round arrow on the extension's
card on `chrome://extensions` and reload the tabs. Do not move or rename the
folder: Chrome remembers its path.

## Use

**Add a sticker to a list item.** Right-click an item of a list and choose
**List Stickers → Add sticker to this list item**.
The extension works out which elements of the page are the items of that list,
flashes them in orange, and opens the sticker for the one you clicked. Items
without a sticker show nothing; right-click any of them to add one.

**Add a sticker to a page.** Right-click anywhere and choose **Add sticker to
this page**. The sticker appears where you clicked and belongs to that page, one
per page. A note written on a list item also shows on the page that item leads
to, and the other way round: note a tea in the catalogue and you see the note on
the tea's own page.

**Edit.** Click a sticker to change its status or note. It saves as you type.

**Move.** Drag a sticker anywhere. Each sticker keeps its own place.

**When the guess is wrong.** Click the extension icon, then *Forget the lists
marked on this site*, then *Mark a list on this page*: point at one item, use
↑ and ↓ until whole items are outlined, and click. Notes are not lost.

**When a sticker is out of sight.** Click the extension icon, then *Put stickers
back in the corners*.

**Back up.** Click the extension icon, then *All notes, export and import*. The
page lists every note from every site and saves them to a JSON file. Removing
the extension deletes its notes, so save a file first.

## How a note finds its item again

A note is tied to the address its item leads to, not to the item's place in the
list. The address is cleaned of the parts that change from visit to visit
(search and session ids, tracking parameters), and of the collection a Shopify
product is shown in, so a note written in one collection shows up in another.
An item without a link of its own is recognised by its title.

## Known limits

- A page sticker is placed by its distance from the top left of the page, so on
  a page whose layout changes with the window width it may end up next to
  different content.
- Works in desktop Chrome only. Notes do not sync between devices.
- If a site changes its markup, the stickers may disappear. The notes stay;
  right-click an item and add a sticker to mark the list again.
- A list whose items are made of two neighbouring blocks (arXiv listings) gets
  the sticker on one of the blocks.
- On sites whose items clip their content, a sticker dragged outside its item
  is hidden behind the item's edge.
- On search results that change with every load, a noted item may simply not be
  on the page next time.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Extension description for Chrome |
| `content.js` | Runs on every page: finds list items, draws stickers, the editor, drag and drop |
| `background.js` | The two **Add sticker** items in the right-click menu |
| `popup.html`, `popup.js` | The window behind the extension icon |
| `options.html`, `options.js` | The page with all notes, export and import |
| `icons/` | The icon in four sizes |
| `site-check/` | An automated check of the extension on real sites |
| `scripts/package.sh` | Builds the ZIP for the Chrome Web Store into `dist/` |
| `store-assets/` | Store listing texts (`CHROMEWEBSTORE.md`), screenshots, promo tile, and the script and demo pages that produce the screenshots |
| `docs/` | The public web page and the privacy policy, served by GitHub Pages |

## Checking on real sites

`site-check/check.mjs` loads the extension into a clean Chromium and, on every
site from `site-check/sites.json`, right-clicks an item of the main list, writes
a note, reloads the page and looks for the note. It needs
[Playwright](https://playwright.dev/) and its Chromium:

```sh
PLAYWRIGHT_CORE=<path to playwright-core> CHROMIUM=<path to the Chromium binary> \
  node site-check/check.mjs <output folder> [site name ...]
```

It writes `results.json` and one screenshot per site, with the elements taken as
list items outlined in red. Its console messages are in Russian. Many large
sites (marketplaces, anything behind a bot check) refuse an automated browser
and are reported as untestable.
