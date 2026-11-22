// Adds two items to the right-click menu, a sticker on a list item and a
// sticker on the page, and tells the page which one was chosen. The page
// itself remembers what was right-clicked and where.

const MENU = {
  'sticker-on-item': { title: 'Add sticker to this list item', message: 'sticker-at-right-click' },
  'sticker-on-page': { title: 'Add sticker to this page', message: 'page-sticker-at-right-click' },
};

chrome.runtime.onInstalled.addListener(async () => {
  // Items of an earlier version would otherwise stay in the menu after an update.
  await chrome.contextMenus.removeAll();
  for (const [id, item] of Object.entries(MENU)) {
    chrome.contextMenus.create({ id, title: item.title, contexts: ['all'] });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const item = MENU[info.menuItemId];
  if (!item || !tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: item.message });
  } catch {
    // Nothing on the page is listening: the tab was opened before the
    // extension was installed or updated, or it is a page extensions may not
    // touch. A silent menu item looks broken, so the icon says something is
    // off, and the popup explains what to do. Chrome clears both on reload.
    await chrome.action.setBadgeBackgroundColor({ color: '#b3402f', tabId: tab.id });
    await chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    await chrome.action.setTitle({ title: 'List Stickers: reload this page to add stickers', tabId: tab.id });
  }
});
