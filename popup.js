const byId = (id) => document.getElementById(id);

async function sendToPage(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.tabs.sendMessage(tab.id, { type });
}

async function showState() {
  let state;
  try {
    state = await sendToPage('state');
  } catch {
    // The page has no content script: a browser-internal page, or a tab that
    // was opened before the extension was installed.
    byId('host').textContent = 'Stickers are not available here';
    byId('summary').textContent =
      'If this is an ordinary site, reload the page and open this window again.';
    byId('pick').disabled = true;
    byId('forget').disabled = true;
    byId('reset').disabled = true;
    return;
  }
  byId('host').textContent = state.host;
  byId('summary').textContent = state.listCount
    ? `List items found on this page: ${state.itemCount}. Notes on this site: ${state.noteCount}. Right-click an item to add a sticker.`
    : `No list is marked on this site yet. Notes on this site: ${state.noteCount}.`;
  byId('forget').disabled = !state.listCount;
  byId('reset').disabled = !state.movedCount;
}

byId('pick').addEventListener('click', async () => {
  await sendToPage('pick');
  window.close();
});

byId('forget').addEventListener('click', async () => {
  // Only the buttons go away; the notes stay and come back when the list is marked again.
  await sendToPage('forget-lists');
  window.close();
});

byId('reset').addEventListener('click', async () => {
  // For a sticker that was dragged out of sight: every sticker on this site
  // goes back to the top right corner of its element.
  await sendToPage('reset-positions');
  window.close();
});

byId('all').addEventListener('click', () => chrome.runtime.openOptionsPage());

showState();
