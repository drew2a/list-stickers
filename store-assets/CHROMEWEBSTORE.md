# Chrome Web Store listing

Everything that goes into the developer dashboard, field by field. The store
strips formatting, so the texts below are plain text: copy them as they are.

Upload the ZIP that `scripts/package.sh` writes to `dist/`.

## Account tab

**Contact email:** andrei.al.andreev@gmail.com. The store shows it on the
extension's page and sends review and policy notices to it. It has to be
confirmed through the link the store sends before the extension can be
published.

## Store listing tab

**Name** (taken from `manifest.json`)

    List Stickers: Sticky Notes for Any Website

**Summary** (taken from `manifest.json`, 132 characters at most)

    Put sticky notes on any web page or list item. Mark products, lessons and articles as done, liked or for later. Private, no account.

**Category:** Tools (the store's group for workflow and productivity tools)

**Language:** English

**Detailed description**

    Put a sticky note on anything you see on the web: a tea in a shop, a lesson in a course, an article in a feed, or the page itself. Come back tomorrow and your note is still there, on the same item.

    Most note extensions attach one note to a whole page. List Stickers attaches a note to each item of a list, so a catalogue of 200 products can hold 200 separate notes, and you can see at a glance what you have already watched, read, tried or rejected.

    WHAT YOU CAN DO
    • Mark an item in one click: ✅ done, 👍 like, 👎 dislike, 🕒 for later
    • Write a note on it: "smoky, bitter on the second brew", "rewatch from minute 40"
    • Put a sticky note on a whole page, exactly where you clicked
    • Drag any sticker to where it does not cover what you want to see
    • See every note from every website on one page
    • Save all notes to a file and load them back

    HOW TO USE
    1. Right-click an item in any list: a product, a video, a lesson, a search result.
    2. Choose List Stickers, then "Add sticker to this list item". The extension works out what the list is and opens a sticker for the item you clicked.
    3. Pick a status, type a note. It saves as you type.
    For a note on the page as a whole, choose "Add sticker to this page".

    WHERE IT HELPS
    • Online shops: remember what you thought of each tea, wine, book or pair of shoes
    • Courses and video archives: mark lessons as watched, note where you stopped
    • Job boards and listings: mark the ones you applied to or ruled out
    • Reading lists, documentation, recipes, search results: mark as read, keep a remark

    A NOTE STAYS WITH ITS ITEM
    A sticker is tied to the address its item leads to, not to its place on the page. Sort the list, filter it, open another page of results: the note follows the item. A note written in a catalogue also shows on the item's own page.

    PRIVACY
    Your notes are stored only in your browser, on your computer. Nothing is sent anywhere: no account, no sync, no analytics, no ads. Removing the extension removes the notes, so save them to a file first if you want to keep them.

    PERMISSIONS
    "Read and change all your data on all websites": stickers have to be drawn on the pages where you put them, and you choose those pages yourself, so the extension must be able to run on any site. It reads a page only to find the items of the list you pointed at, and it never sends anything off your computer.

    LIMITS
    Works in Chrome on a computer. Notes do not sync between devices. If a website is redesigned, stickers may disappear until you add one again; the notes themselves are kept.

    SUPPORT
    Questions and bug reports: andrei.al.andreev@gmail.com or https://github.com/drew2a/list-stickers/issues
    The code is open: https://github.com/drew2a/list-stickers

**Homepage URL:** https://drew2a.github.io/list-stickers/

**Support URL:** https://github.com/drew2a/list-stickers/issues

**Graphics** (in `store-assets/`)

| Field | File |
|---|---|
| Store icon, 128×128 | `icons/icon128.png` |
| Screenshots, 1280×800 | `screenshots/1-shop.png`, `screenshots/2-lessons.png`, `screenshots/3-all-notes.png` |
| Small promo tile, 440×280 | `promo-small-440x280.png` |

## Privacy tab

**Single purpose**

    Lets the user attach private notes and status marks to items of lists and to pages on websites, and shows those notes again when the user returns.

**Permission justifications**

`storage`

    Stores the user's notes, their status marks, the position of each sticker and the rules that say which elements of a site form a list. Everything is kept in local extension storage on the user's device.

`contextMenus`

    Adds the two right-click menu items that are the way to create a sticker: "Add sticker to this list item" and "Add sticker to this page".

Host permission (the content script runs on all `http` and `https` pages)

    The user can put a sticker on any website, and a sticker has to be shown again every time the user opens that page, without any click. So the content script must load on every page to check whether the user has notes for it and to draw them. It reads the structure and link addresses of the page only to find the items of the list the user right-clicked. It does not read form data, does not change the site's own content, and sends nothing over the network. activeTab is not enough, because it would require a click on every page load before saved notes could appear.

**Remote code:** No, I am not using remote code. All JavaScript is in the package.

**Data usage:** no box ticked. The extension does not collect or transmit any
user data: notes, page addresses and page titles are written only to the
browser's local extension storage and never leave the device.

Certify all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://drew2a.github.io/list-stickers/privacy

## Distribution tab

**Visibility:** Public. **Regions:** all. **Price:** free.

## Why the name and summary are worded this way

People who look for this kind of tool type "sticky notes", "notes on website",
"annotate web page", "mark as read" or "mark as watched". The store's own
guidance says ranking depends on ratings and on how many people keep the
extension installed, and warns against stuffing keywords into the name. So:

- The name keeps the brand and adds the one phrase with the most searches in
  this category, "sticky notes", plus "any website".
- The summary opens with what the extension does and names the three things
  people mark: products, lessons, articles.
- The description uses the words people search for where they describe a real
  feature (mark as watched, mark as read, notes on products), each a few times
  at most.

What actually moves the listing up after launch is installs that stay and
ratings. The description asks for nothing; a first handful of honest ratings
from people who use it matters more than any wording here.

## Version history

See [CHANGELOG.md](../CHANGELOG.md). Before uploading a new version, bump
`version` in `manifest.json`, add its entry there, and run
`scripts/package.sh`.
