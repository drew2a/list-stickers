# Changelog

What changed in each version of List Stickers, newest first. The version
number is the one in `manifest.json`; the Chrome Web Store shows the same.

## 1.0.1 (not yet in the Chrome Web Store)

- The "like" mark is a thumbs up 👍 instead of a star, to pair with the
  thumbs down.
- A sticker could end up under the text of a product card and could not be
  clicked or dragged, on sites that put the card's text on a raised layer
  (for example moychay.nl). Stickers now always stay on top inside their card,
  and still go under the site's own header and menus.
- Store screenshots retaken to show the new 👍 mark.

## 1.0.0 (2026-11-22)

First public version, submitted to the Chrome Web Store.

- Right-click an item of any list, choose "Add sticker to this list item":
  the extension finds the list and puts a sticker on that item.
- Statuses: ✅ done, ⭐ like, 👎 dislike, 🕒 for later, plus a free-text note.
- "Add sticker to this page" puts a sticker on the page itself, where you
  clicked. A note made in a list also shows on the item's own page.
- Stickers can be dragged one by one; the popup puts them all back in their
  corners.
- Notes follow their item when the list is sorted, filtered or paged, because
  they are tied to the item's address, not its place on the page.
- A page with all notes from all sites, with export to a file and import.
- Notes are stored only in the browser; nothing is sent anywhere.
