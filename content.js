// Runs on every page. Draws a sticker button on each element of the lists the
// user has marked on this site, and lets the user mark a new list.
//
// Everything for one site lives under a single storage key:
//   "site:<hostname>" -> { selectors: [css], notes: { <itemKey>: note }, positions: { <itemKey>: place } }
// A note is { status, text, title, page, updated }.
(() => {
  'use strict';

  const STORE_KEY = 'site:' + location.hostname;
  const STATUSES = [
    { id: 'done', icon: '✅', label: 'Done: watched, read or tried' },
    { id: 'like', icon: '⭐', label: 'Like' },
    { id: 'dislike', icon: '👎', label: 'Dislike' },
    { id: 'later', icon: '🕒', label: 'For later' },
  ];
  const STATUS_ICON = Object.fromEntries(STATUSES.map((s) => [s.id, s.icon]));
  const BADGE_TAG = 'list-sticker';
  const UI_TAG = 'list-sticker-ui';
  // A sticker can also sit on the page as a whole instead of on a list element.
  // It is then attached to the root element and placed by coordinates in the page.
  const PAGE = document.documentElement;

  // `positions` holds where the user dragged a sticker inside its list element:
  // { <itemKey>: { horizontal: 'left'|'right', x, vertical: 'top'|'bottom', y } },
  // measured in pixels from the nearest corner of the element.
  const siteFrom = (stored) => ({
    selectors: stored?.selectors || [],
    notes: stored?.notes || {},
    positions: stored?.positions || {},
  });
  let site = siteFrom(null);

  // ---------- storage ----------

  async function loadSite() {
    const stored = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY];
    site = siteFrom(stored);
  }

  // Re-reads before writing so that a change made in another tab of the same
  // site is not overwritten by this tab's older copy.
  async function updateSite(change) {
    try {
      await loadSite();
      change(site);
      await chrome.storage.local.set({ [STORE_KEY]: site });
    } catch (error) {
      // Happens when the extension was reloaded while this page stayed open.
      console.warn('List Stickers: could not save, reload the page.', error);
    }
    render();
  }

  // ---------- which note belongs to which list element ----------

  function itemTitle(el) {
    if (el === PAGE) return document.title.replace(/\s+/g, ' ').trim().slice(0, 120);
    const heading =
      el.querySelector('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="name" i]') || el;
    return heading.textContent.replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function linksOf(el) {
    const links = el.matches('a[href]') ? [el] : [...el.querySelectorAll('a[href]')];
    const wrappingLink = el.closest('a[href]');
    if (!links.length && wrappingLink) links.push(wrappingLink);
    const urls = [];
    for (const link of links) {
      const raw = link.getAttribute('href');
      if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel):/i.test(raw)) continue;
      try {
        // How much this link looks like the entry's title: a heading counts
        // most, then the amount of text. "Star", "12 comments", an author's
        // name or a vote arrow lose to the title.
        const heading = link.querySelector('h1,h2,h3,h4,h5,h6') || link.closest('h1,h2,h3,h4,h5,h6');
        const inHeading = heading && el.contains(heading);
        const textLength = Math.min(link.textContent.replace(/\s+/g, ' ').trim().length, 200);
        urls.push({ url: new URL(link.href), weight: (inHeading ? 1000 : 0) + textLength });
      } catch {
        // Not a parsable address: skip it.
      }
    }
    return urls;
  }

  // Parts of an address that record how the visitor got there, not what the
  // page is. They change between visits and would lose the note.
  const TRACKING_PARAMETER =
    /^(utm_\w+|fbclid|gclid|yclid|spm|ref|ref_|qid|crid|sprefix|sr|dib|dib_tag|pp|si|algo_pvid|algo_exp_id|pdp_npi|pdp_ext_f|curPageLogUid|utparam-url|search_p4p_id)$/;

  // An address gives two candidate keys: without the part after "?" and with
  // it. The short one is preferred, because that part is where sites put
  // per-visit ids; the long one is needed on sites where it is the only thing
  // that tells pages apart (watch?v=..., item?id=...). `describesPage` names
  // the parameters that are the same for a whole list and so say nothing.
  function addressForms(url, describesPage = () => false) {
    const kept = [...url.searchParams].filter(
      ([name, value]) => !TRACKING_PARAMETER.test(name) && !describesPage(name + '=' + value),
    );
    // A hash is part of the address only on sites that route through it.
    const hash = /^#[/!]/.test(url.hash) ? url.hash : '';
    // Shops built on Shopify show one product under several addresses,
    // /collections/<any>/products/<name> and /products/<name>; the note
    // must follow the product into every collection.
    const path = url.pathname
      .replace(/\/ref=[^/]*$/, '')
      .replace(/^\/collections\/[^/]+(?=\/products\/)/, '');
    const short = url.origin + path + hash;
    const long = kept.length ? url.origin + path + '?' + new URLSearchParams(kept) + hash : short;
    return { short, long };
  }

  // The key of the note that belongs to the page being viewed, if there is
  // one. It is the same kind of key a list element leading to this page gets,
  // so a note written on a tea in the catalogue also shows on the tea's own page.
  function pageNoteKey() {
    const { short, long } = addressForms(new URL(location.href));
    return ['u:' + long, 'u:' + short].find((key) => site.notes[key]) || null;
  }

  // How many elements may lead to the same address before that address stops
  // identifying anything. One thing shown in two or three places of a page
  // (two carousels) should share one note; a category link shared by many
  // elements must not become their key.
  const MAX_ELEMENTS_PER_ADDRESS = 3;

  // The key must stay the same when the list is re-sorted, grows, or is opened
  // again tomorrow, so it is the address the element leads to, cleaned of
  // everything that is not about the element itself.
  function computeKeys(items) {
    const linksPerItem = items.map(linksOf);

    // A parameter with the same value in nearly every element describes the
    // page (search id, session), not the element.
    const elementsWithValue = new Map();
    for (const urls of linksPerItem) {
      const values = new Set();
      for (const { url } of urls) url.searchParams.forEach((value, name) => values.add(name + '=' + value));
      for (const pair of values) elementsWithValue.set(pair, (elementsWithValue.get(pair) || 0) + 1);
    }
    const describesPage = (pair) =>
      items.length >= 3 && elementsWithValue.get(pair) >= items.length * 0.8;

    const candidates = ({ url, weight }) => ({ ...addressForms(url, describesPage), weight });
    const candidatesPerItem = linksPerItem.map((urls) => urls.map(candidates));

    const usage = new Map();
    for (const list of candidatesPerItem) {
      const addresses = new Set(list.flatMap((c) => [c.short, c.long]));
      for (const address of addresses) usage.set(address, (usage.get(address) || 0) + 1);
    }
    const usable = (address) => usage.get(address) <= MAX_ELEMENTS_PER_ADDRESS;
    const keys = items.map((el, i) => {
      // Every link offers its best form. Among the addresses that are not
      // shared with many other elements, the most title-like link wins, and
      // among equals the first on the page.
      let own = null;
      let ownWeight = -1;
      for (const { short, long, weight } of candidatesPerItem[i]) {
        const address = usable(short) ? short : usable(long) ? long : null;
        if (address && weight > ownWeight) {
          own = address;
          ownWeight = weight;
        }
      }
      if (own) return 'u:' + own;
      const id = el.dataset.id || el.id;
      if (id) return 'i:' + id;
      const title = itemTitle(el);
      return title ? 't:' + title : null;
    });

    // Elements without a link of their own are told apart by their title. When
    // several share a title (every post of a channel is headed by the channel's
    // name), a note on one would show up on all of them, so the whole text is
    // tried, and an element that is still not unique gets no sticker.
    const timesUsed = (list) => {
      const counts = new Map();
      for (const key of list) counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    };
    const byTitle = timesUsed(keys);
    const wholeText = (el) => 't:' + el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
    const retried = keys.map((key, i) =>
      key && key.startsWith('t:') && byTitle.get(key) > 1 ? wholeText(items[i]) : key,
    );
    const byText = timesUsed(retried);
    return retried.map((key) => (key && key.startsWith('t:') && byText.get(key) > 1 ? null : key));
  }

  // ---------- sticker buttons on list elements ----------

  const BADGE_CSS = `
    button {
      all: initial;
      display: flex; gap: 4px; align-items: flex-start;
      max-width: 170px; padding: 3px 7px; border-radius: 6px;
      font: 13px/1.3 system-ui, sans-serif; color: #333; background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, .35);
      cursor: grab; user-select: none;
      /* Nothing is drawn on an element until it has a sticker. The invisible
         button still marks the place where a new sticker's editor opens. */
      visibility: hidden;
    }
    button.filled { visibility: visible; }
    button.dragging { cursor: grabbing; box-shadow: 0 6px 16px rgba(0, 0, 0, .4); }
    button.note { background: #fff3a8; color: #3a3200; }
    .text {
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; overflow-wrap: anywhere; white-space: pre-wrap;
    }
  `;

  const badges = new WeakMap();

  function attachBadge(el, key) {
    let badge = badges.get(el);
    if (!badge) {
      const host = document.createElement(BADGE_TAG);
      host.style.cssText = 'all:initial;position:absolute;z-index:50;touch-action:none;';
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${BADGE_CSS}</style><button type="button"></button>`;
      badge = { host, button: root.querySelector('button'), key, dragging: false };
      listenToBadge(el, badge);
      badges.set(el, badge);
    }
    badge.key = key;
    // A page sticker and a list sticker for the same thing are placed separately.
    badge.placeKey = el === PAGE ? 'page:' + key : key;
    if (el === PAGE) badge.host.style.zIndex = '2147483000';
    if (badge.host.parentElement !== el) {
      if (el !== PAGE && getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(badge.host);
    }
    paintBadge(badge);
    if (!badge.dragging) placeBadge(badge, el);
  }

  // Top right corner unless the user dragged this sticker somewhere else.
  function placeBadge(badge, el) {
    const place = site.positions[badge.placeKey];
    const style = badge.host.style;
    style.left = style.right = style.top = style.bottom = 'auto';
    if (place) {
      style[place.horizontal] = place.x + 'px';
      style[place.vertical] = place.y + 'px';
    } else if (el === PAGE) {
      style.top = '90px';
      style.left = Math.max(8, PAGE.clientWidth - 220) + 'px';
    } else {
      // In a row lower than the sticker plus its margin, sit as high as fits
      // rather than hang out below the row.
      const spare = (el.offsetHeight - badge.host.offsetHeight) / 2;
      style.top = Math.max(0, Math.min(6, spare)) + 'px';
      style.right = '6px';
    }
  }

  // A click opens the sticker, a drag moves it inside its list element.
  // The list element is often a link or has its own click handler, so nothing
  // that happens on the sticker may reach it: no opening of the product, no
  // dragging of the link.
  function listenToBadge(el, badge) {
    const { host } = badge;
    let start = null;
    let moved = false;

    host.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      moved = false;
      if (event.button !== 0) return;
      const box = host.getBoundingClientRect();
      start = { x: event.clientX, y: event.clientY, grabX: event.clientX - box.left, grabY: event.clientY - box.top };
      host.setPointerCapture(event.pointerId);
    });

    host.addEventListener('pointermove', (event) => {
      if (!start) return;
      event.stopPropagation();
      // A few pixels of slack, so a slightly shaky click is still a click.
      if (!moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return;
      if (!moved) {
        moved = true;
        badge.dragging = true;
        badge.button.classList.add('dragging');
        closeEditor();
      }
      const frame = el.getBoundingClientRect();
      const style = host.style;
      style.right = style.bottom = 'auto';
      // No limit to the element's edges: the sticker may hang outside it. On
      // sites whose list elements clip their content it then disappears behind
      // the edge; the popup has a button that puts all stickers back.
      style.left = event.clientX - start.grabX - frame.left + 'px';
      style.top = event.clientY - start.grabY - frame.top + 'px';
    });

    const drop = (event) => {
      event.stopPropagation();
      if (!start) return;
      start = null;
      if (!moved) return;
      badge.dragging = false;
      badge.button.classList.remove('dragging');
      // Remembered from the nearest corner, so the sticker keeps its corner
      // when the element changes size (another window width, a longer title).
      const frame = el.getBoundingClientRect();
      const box = host.getBoundingClientRect();
      // A page sticker is always measured from the top left of the page.
      const onLeft = el === PAGE || box.left + box.width / 2 < frame.left + frame.width / 2;
      const onTop = el === PAGE || box.top + box.height / 2 < frame.top + frame.height / 2;
      const place = {
        horizontal: onLeft ? 'left' : 'right',
        x: Math.round(onLeft ? box.left - frame.left : frame.right - box.right),
        vertical: onTop ? 'top' : 'bottom',
        y: Math.round(onTop ? box.top - frame.top : frame.bottom - box.bottom),
      };
      const placeKey = badge.placeKey;
      updateSite((current) => {
        current.positions[placeKey] = place;
      });
    };
    host.addEventListener('pointerup', drop);
    host.addEventListener('pointercancel', drop);

    host.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      // The click that ends a drag must not open the editor.
      if (moved) {
        moved = false;
        return;
      }
      openEditor(el, badge);
    });
    host.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      event.preventDefault();
    });
    host.addEventListener('mouseup', (event) => event.stopPropagation());
    host.addEventListener('dragstart', (event) => event.preventDefault());
  }

  function paintBadge(badge) {
    const note = site.notes[badge.key];
    const { button } = badge;
    button.replaceChildren();
    // An element without a sticker must stay fully clickable in its corner.
    badge.host.style.pointerEvents = note ? 'auto' : 'none';
    if (!note) {
      button.className = '';
      button.title = '';
      button.textContent = '＋';
      return;
    }
    button.className = note.text ? 'filled note' : 'filled';
    button.title = note.text || '';
    const icon = STATUS_ICON[note.status];
    if (icon) {
      const iconEl = document.createElement('span');
      iconEl.textContent = icon;
      button.appendChild(iconEl);
    }
    if (note.text) {
      const textEl = document.createElement('span');
      textEl.className = 'text';
      textEl.textContent = note.text;
      button.appendChild(textEl);
    }
  }

  function findItems() {
    const found = new Set();
    for (const selector of site.selectors) {
      try {
        document.querySelectorAll(selector).forEach((el) => found.add(el));
      } catch {
        // A selector saved by an older version may no longer parse.
      }
    }
    return [...found];
  }

  // Only elements that have a sticker, or whose sticker is being written right
  // now, get anything added to them. A list of several hundred entries with
  // three notes costs three small elements, and the site's own entries are
  // otherwise left untouched.
  function render() {
    const items = findItems();
    const keys = computeKeys(items);
    const withSticker = new Set();
    items.forEach((el, i) => {
      const key = keys[i];
      if (!key || !(site.notes[key] || el === editor?.el)) return;
      attachBadge(el, key);
      withSticker.add(el);
    });
    const pageKey = pageNoteKey();
    if (pageKey) {
      attachBadge(PAGE, pageKey);
      withSticker.add(PAGE);
    } else if (editor?.el === PAGE) {
      withSticker.add(PAGE);
    }
    document.querySelectorAll(BADGE_TAG).forEach((host) => {
      if (!withSticker.has(host.parentElement)) host.remove();
    });
  }

  // ---------- shared layer for the editor and the picker hint ----------

  const UI_CSS = `
    .panel {
      position: absolute; width: 260px; box-sizing: border-box; padding: 10px;
      background: #fffbe0; color: #2b2620; border: 1px solid #e0d48a; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .25); font: 14px/1.4 system-ui, sans-serif;
    }
    .title {
      font-weight: 600; font-size: 13px; margin-bottom: 8px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .statuses { display: flex; gap: 6px; margin-bottom: 8px; }
    .statuses button {
      width: 36px; height: 32px; padding: 0; font-size: 18px; cursor: pointer;
      border: 1px solid #e0d48a; border-radius: 8px; background: #fff;
    }
    .statuses button.on { background: #ffd84d; border-color: #b89500; }
    textarea {
      width: 100%; min-height: 80px; box-sizing: border-box; resize: vertical; padding: 6px;
      font: inherit; color: inherit; background: #fff;
      border: 1px solid #e0d48a; border-radius: 8px;
    }
    .actions { display: flex; justify-content: space-between; margin-top: 8px; }
    .actions button {
      border: 0; background: none; padding: 4px 6px; cursor: pointer;
      font: inherit; font-size: 13px; color: #7a6a00;
    }
    .actions .delete { color: #b3402f; }
    .hint {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      max-width: 90vw; padding: 10px 16px; border-radius: 10px; pointer-events: none;
      background: #2b2620; color: #fff; font: 14px/1.4 system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .3);
    }
  `;

  let ui = null;

  function uiRoot() {
    if (!ui) {
      const host = document.createElement(UI_TAG);
      host.style.cssText = 'all:initial;position:absolute;top:0;left:0;z-index:2147483647;';
      ui = host.attachShadow({ mode: 'open' });
      ui.innerHTML = `<style>${UI_CSS}</style>`;
      // Typing a note must not trigger the site's keyboard shortcuts.
      for (const type of ['keydown', 'keyup', 'keypress']) {
        host.addEventListener(type, (event) => {
          event.stopPropagation();
          if (type === 'keydown' && event.key === 'Escape') closeEditor();
        });
      }
    }
    if (!ui.host.isConnected) document.documentElement.appendChild(ui.host);
    return ui;
  }

  // ---------- editor ----------

  let editor = null;

  function openEditor(el, badge) {
    closeEditor();
    const root = uiRoot();
    const key = badge.key;
    const draft = { status: site.notes[key]?.status || '', text: site.notes[key]?.text || '' };

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="title"></div>
      <div class="statuses"></div>
      <textarea placeholder="Note…"></textarea>
      <div class="actions">
        <button type="button" class="delete">Delete sticker</button>
        <button type="button" class="close">Done</button>
      </div>`;
    panel.querySelector('.title').textContent = itemTitle(el);
    const textarea = panel.querySelector('textarea');
    textarea.value = draft.text;

    // Deleting a sticker also forgets where it was dragged to.
    let forgetPlace = false;
    const save = () =>
      updateSite((current) => {
        if (forgetPlace) delete current.positions[badge.placeKey];
        const text = draft.text.trim();
        if (!draft.status && !text) {
          delete current.notes[key];
          return;
        }
        current.notes[key] = {
          status: draft.status,
          text,
          title: itemTitle(el),
          page: location.href,
          updated: Date.now(),
        };
      });

    const statusRow = panel.querySelector('.statuses');
    const paintStatuses = () => {
      for (const button of statusRow.children) {
        button.classList.toggle('on', button.dataset.status === draft.status);
      }
    };
    for (const status of STATUSES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.status = status.id;
      button.textContent = status.icon;
      button.title = status.label;
      button.addEventListener('click', () => {
        draft.status = draft.status === status.id ? '' : status.id;
        paintStatuses();
        save();
      });
      statusRow.appendChild(button);
    }
    paintStatuses();

    let pendingSave = null;
    const flush = () => {
      if (pendingSave === null) return null;
      clearTimeout(pendingSave);
      pendingSave = null;
      return save();
    };
    textarea.addEventListener('input', () => {
      draft.text = textarea.value;
      clearTimeout(pendingSave);
      pendingSave = setTimeout(flush, 400);
    });
    panel.querySelector('.delete').addEventListener('click', () => {
      draft.status = '';
      draft.text = '';
      forgetPlace = true;
      clearTimeout(pendingSave);
      pendingSave = null;
      save();
      closeEditor();
    });
    panel.querySelector('.close').addEventListener('click', closeEditor);

    const anchor = badge.host.getBoundingClientRect();
    const width = 260;
    const maxLeft = scrollX + document.documentElement.clientWidth - width - 8;
    const left = Math.max(scrollX + 8, Math.min(anchor.right + scrollX - width, maxLeft));
    panel.style.left = left + 'px';
    panel.style.top = anchor.bottom + scrollY + 6 + 'px';

    root.appendChild(panel);
    editor = { panel, flush, el };
    textarea.focus();
  }

  function closeEditor() {
    if (!editor) return;
    const saving = editor.flush();
    editor.panel.remove();
    editor = null;
    // Saving redraws when it is done; otherwise redraw now, so an element whose
    // sticker was opened and left empty goes back to having nothing on it.
    if (!saving) render();
  }

  document.addEventListener(
    'mousedown',
    (event) => {
      if (editor && !event.composedPath().includes(ui.host)) closeEditor();
    },
    true,
  );

  // ---------- marking a list: the user points at one element ----------

  // Siblings that look like the same kind of thing: same tag and a shared class.
  function similarSiblings(el) {
    const parent = el.parentElement;
    if (!parent) return [];
    const classes = [...el.classList];
    return [...parent.children].filter(
      (sibling) =>
        sibling !== el &&
        sibling.tagName === el.tagName &&
        (classes.length
          ? classes.some((name) => sibling.classList.contains(name))
          : sibling.classList.length === 0),
    );
  }

  function selectorPart(el, siblings = []) {
    // Only classes every similar sibling has, so that "selected" or "first"
    // on the pointed element does not narrow the list down to it alone.
    const classes = [...el.classList].filter((name) =>
      siblings.every((sibling) => sibling.classList.contains(name)),
    );
    return el.tagName.toLowerCase() + classes.map((name) => '.' + CSS.escape(name)).join('');
  }

  function buildSelector(el) {
    const parts = [selectorPart(el, similarSiblings(el))];
    let namedAncestors = 0;
    let parent = el.parentElement;
    for (let depth = 0; parent && parent !== document.body && depth < 5; depth++) {
      // An id with a long number in it is usually generated per element.
      if (parent.id && !/\d{3,}/.test(parent.id)) {
        parts.unshift('#' + CSS.escape(parent.id));
        break;
      }
      parts.unshift(selectorPart(parent, similarSiblings(parent)));
      if (parent.classList.length && ++namedAncestors >= 2) break;
      parent = parent.parentElement;
    }
    return parts.join(' > ');
  }

  let picker = null;

  function startPicker() {
    if (picker) return;
    closeEditor();
    const hint = document.createElement('div');
    hint.className = 'hint';
    uiRoot().appendChild(hint);

    const style = document.createElement('style');
    style.textContent = `
      [data-list-sticker-pick] {
        outline: 2px solid #f5a623 !important; outline-offset: -2px !important;
        cursor: crosshair !important;
      }
      [data-list-sticker-pick="current"] { outline: 4px solid #e8590c !important; }
    `;
    document.head.appendChild(style);

    picker = { hint, style, chain: [], index: 0, locked: false, selector: '', marked: [] };
    paintPicker();
    for (const [type, handler] of PICKER_EVENTS) {
      document.addEventListener(type, handler, true);
    }
  }

  function stopPicker() {
    if (!picker) return;
    for (const [type, handler] of PICKER_EVENTS) {
      document.removeEventListener(type, handler, true);
    }
    for (const el of picker.marked) el.removeAttribute('data-list-sticker-pick');
    picker.hint.remove();
    picker.style.remove();
    picker = null;
  }

  function paintPicker() {
    for (const el of picker.marked) el.removeAttribute('data-list-sticker-pick');
    picker.marked = [];
    picker.selector = '';
    const el = picker.chain[picker.index];
    if (el) {
      picker.selector = buildSelector(el);
      try {
        picker.marked = [...document.querySelectorAll(picker.selector)];
      } catch {
        picker.marked = [];
      }
      for (const match of picker.marked) {
        match.setAttribute('data-list-sticker-pick', match === el ? 'current' : '');
      }
    }
    const count = picker.marked.length;
    picker.hint.textContent =
      (count ? `Outlined: ${count}. ` : 'Point at one item of the list. ') +
      'Click to choose. ↑ outlines a bigger block, ↓ a smaller one. Esc cancels.';
  }

  function onPickerMove(event) {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(`${BADGE_TAG}, ${UI_TAG}`)) return;
    const current = picker.chain[picker.index];
    // After the user widened or narrowed the outline with the arrows, keep it
    // until the mouse leaves the outlined element.
    if (picker.locked && current?.contains(target)) return;
    if (!picker.locked && target === picker.chain[0]) return;

    const chain = [];
    for (let node = target; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      chain.push(node);
    }
    let index = chain.findIndex((node) => similarSiblings(node).length >= 2);
    if (index < 0) index = chain.findIndex((node) => similarSiblings(node).length >= 1);
    picker.chain = chain;
    picker.index = Math.max(index, 0);
    picker.locked = false;
    paintPicker();
  }

  function onPickerKey(event) {
    if (event.key === 'Escape') {
      stopPicker();
    } else if (event.key === 'ArrowUp' && picker.index < picker.chain.length - 1) {
      picker.index++;
      picker.locked = true;
      paintPicker();
    } else if (event.key === 'ArrowDown' && picker.index > 0) {
      picker.index--;
      picker.locked = true;
      paintPicker();
    } else if (!['ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onPickerClick(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const selector = picker.selector;
    if (!selector || !picker.marked.length) return;
    stopPicker();
    updateSite((current) => {
      if (!current.selectors.includes(selector)) current.selectors.push(selector);
    });
  }

  // While picking, the page itself must not react to the mouse.
  function swallow(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  const PICKER_EVENTS = [
    ['mousemove', onPickerMove],
    ['keydown', onPickerKey],
    ['click', onPickerClick],
    ['mousedown', swallow],
    ['mouseup', swallow],
    ['pointerdown', swallow],
    ['pointerup', swallow],
  ];

  // ---------- right-click on an element: guess the list and open the sticker ----------

  let lastRightClicked = null;
  let lastRightClickPoint = null;
  document.addEventListener(
    'contextmenu',
    (event) => {
      lastRightClickPoint = { x: Math.round(event.pageX), y: Math.round(event.pageY) };
      lastRightClicked = event.target instanceof Element ? event.target : null;
    },
    true,
  );

  // True when the elements that look like `node` behave like entries of one
  // list: nearly every one of them has something of its own to be told apart
  // by. Either its own link, or, in lists without links, its own text.
  // Price tags fail this (same text everywhere), tags inside cards fail it
  // (the same tag link repeats across cards), table cells of mixed kinds fail it.
  // Returns the set of keys of those entries, or null when it is not such a list.
  function entryKeys(node) {
    // A piece inside a link (one slide of a card's picture gallery) is not an
    // entry; the entry is the link or something around it.
    const wrappingLink = node.closest('a[href]');
    if (wrappingLink && wrappingLink !== node) return null;
    let instances;
    try {
      instances = [...document.querySelectorAll(buildSelector(node))];
    } catch {
      return null;
    }
    // Placeholders of entries that have not loaded yet say nothing either way.
    instances = instances.filter((el) => el.textContent.trim() || el.querySelector('img'));
    if (instances.length < 2) return null;
    const keys = computeKeys(instances);
    const timesSeen = new Map();
    for (const key of keys) timesSeen.set(key, (timesSeen.get(key) || 0) + 1);
    const share = (test) => keys.filter((key) => key && test(key)).length / keys.length;
    const withOwnLink = share((key) => key.startsWith('u:'));
    const withOwnText = share((key) => !key.startsWith('u:') && timesSeen.get(key) === 1);
    // Mostly different addresses: a handful of tags repeated over many cards
    // is not a list of different things.
    const linkKeys = keys.filter((key) => key && key.startsWith('u:'));
    const mostlyDifferent = new Set(linkKeys).size >= linkKeys.length * 0.6;
    const isList = (withOwnLink >= 0.8 && mostlyDifferent) || (withOwnLink < 0.2 && withOwnText >= 0.8);
    return isList ? new Set(keys.filter(Boolean)) : null;
  }

  // Some sites wrap every entry in an element that draws nothing itself
  // (display: contents). A sticker cannot be placed in it, so the single
  // element inside it is taken instead.
  function withOwnBox(node) {
    while (getComputedStyle(node).display === 'contents' && node.children.length === 1) {
      node = node.children[0];
    }
    return node;
  }

  // Walks up from the clicked element to the one that is a whole list entry:
  // the nearest repeated block whose look-alikes pass the test above. Pieces of
  // running text (several links in one line) are not taken as entries.
  function guessListItem(target) {
    const repeated = [];
    for (let node = target; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      if (similarSiblings(node).length >= 1) repeated.push(withOwnBox(node));
    }
    // A sticker needs a box to sit in: running text and wrappers that draw
    // nothing themselves do not have one.
    const blocks = repeated.filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && !['inline', 'contents'].includes(getComputedStyle(node).display);
    });
    // The nearest block that is a list entry may be only a part of the card
    // (its text half, without the picture). As long as a wider repeated block
    // holds exactly the same entries, the wider one is the whole card.
    let entry = null;
    let keys = null;
    for (const node of blocks) {
      const nodeKeys = entryKeys(node);
      if (!entry) {
        if (nodeKeys) [entry, keys] = [node, nodeKeys];
        continue;
      }
      const sameEntries =
        nodeKeys && nodeKeys.size === keys.size && [...nodeKeys].every((key) => keys.has(key));
      if (!sameEntries) break;
      entry = node;
    }
    const leadsSomewhere = (node) => node.matches('a[href]') || node.querySelector('a[href]');
    return (
      entry ||
      repeated.find(leadsSomewhere) ||
      repeated.find((node) => similarSiblings(node).length >= 2) ||
      repeated[0] ||
      null
    );
  }

  function showMessage(text) {
    const message = document.createElement('div');
    message.className = 'hint';
    message.textContent = text;
    uiRoot().appendChild(message);
    setTimeout(() => message.remove(), 5000);
  }

  async function addStickerAtRightClick() {
    let target = lastRightClicked;
    if (!target || !target.isConnected) return;
    if (target.closest(BADGE_TAG)) target = target.closest(BADGE_TAG).parentElement;

    // Already inside a marked list: just open that element's sticker.
    const marked = findItems().filter((item) => item.contains(target));
    let item = marked.find((el) => !marked.some((other) => other !== el && el.contains(other)));

    if (!item) {
      item = guessListItem(target);
      if (!item) {
        showMessage(
          'No list of similar items found here. Mark the list by hand from the extension icon.',
        );
        return;
      }
      const selector = buildSelector(item);
      await updateSite((current) => {
        if (!current.selectors.includes(selector)) current.selectors.push(selector);
      });
      // Briefly show which elements were taken as the list, so a wrong guess is visible.
      for (const el of findItems()) {
        el.animate(
          [
            { outline: '3px solid #f5a623', outlineOffset: '-3px' },
            { outline: '3px solid transparent', outlineOffset: '-3px' },
          ],
          { duration: 1800 },
        );
      }
    }

    const items = findItems();
    const key = computeKeys(items)[items.indexOf(item)];
    if (!key) {
      showMessage('Could not attach a sticker to this item. Mark the list by hand from the extension icon.');
      return;
    }
    attachBadge(item, key);
    openEditor(item, badges.get(item));
  }

  // One sticker per page, put where the user right-clicked.
  async function addStickerToPage() {
    closeEditor();
    let key = pageNoteKey();
    if (!key) {
      key = 'u:' + addressForms(new URL(location.href)).long;
      const point = lastRightClickPoint;
      if (point) {
        await updateSite((current) => {
          current.positions['page:' + key] = { horizontal: 'left', x: point.x, vertical: 'top', y: point.y };
        });
      }
    }
    attachBadge(PAGE, key);
    openEditor(PAGE, badges.get(PAGE));
  }

  // ---------- wiring ----------

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'state') {
      reply({
        host: location.hostname,
        listCount: site.selectors.length,
        itemCount: findItems().length,
        noteCount: Object.keys(site.notes).length,
        movedCount: Object.keys(site.positions).length,
      });
    } else if (message.type === 'pick') {
      startPicker();
      reply({ ok: true });
    } else if (message.type === 'sticker-at-right-click') {
      addStickerAtRightClick();
      reply({ ok: true });
    } else if (message.type === 'page-sticker-at-right-click') {
      addStickerToPage();
      reply({ ok: true });
    } else if (message.type === 'reset-positions') {
      updateSite((current) => {
        current.positions = {};
      });
      reply({ ok: true });
    } else if (message.type === 'forget-lists') {
      updateSite((current) => {
        current.selectors = [];
      });
      reply({ ok: true });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORE_KEY]) return;
    const value = changes[STORE_KEY].newValue;
    site = siteFrom(value);
    render();
  });

  (async () => {
    await loadSite();
    render();
    // Many sites draw or redraw the list after the page has loaded.
    let scheduled = null;
    new MutationObserver(() => {
      if (!site.selectors.length && !Object.keys(site.notes).length) return;
      clearTimeout(scheduled);
      scheduled = setTimeout(render, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });
  })();
})();
