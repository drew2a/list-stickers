// Page with every note from every site, plus saving to and loading from a file.
// Storage layout is described at the top of content.js.

const SITE_PREFIX = 'site:';
const STATUS_ICON = { done: '✅', like: '👍', dislike: '👎', later: '🕒' };
const byId = (id) => document.getElementById(id);

async function readSites() {
  const everything = await chrome.storage.local.get(null);
  const sites = {};
  for (const [key, value] of Object.entries(everything)) {
    if (key.startsWith(SITE_PREFIX)) sites[key.slice(SITE_PREFIX.length)] = value;
  }
  return sites;
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function noteCard(host, key, note) {
  const card = element('div', 'note');
  card.appendChild(element('span', '', STATUS_ICON[note.status] || '📝'));

  const title = element('span', 'title');
  // Keys that start with "u:" are the address the list element leads to.
  const address = key.startsWith('u:') ? key.slice(2) : note.page;
  if (address) {
    const link = element('a', '', note.title || address);
    link.href = address;
    link.target = '_blank';
    link.rel = 'noreferrer';
    title.appendChild(link);
  } else {
    title.textContent = note.title || key;
  }
  card.appendChild(title);

  const remove = element('button', '', 'Delete');
  remove.addEventListener('click', async () => {
    const storeKey = SITE_PREFIX + host;
    const site = (await chrome.storage.local.get(storeKey))[storeKey];
    delete site.notes[key];
    await chrome.storage.local.set({ [storeKey]: site });
  });
  card.appendChild(remove);

  if (note.text) card.appendChild(element('div', 'text', note.text));
  if (note.updated) {
    card.appendChild(element('div', 'date', new Date(note.updated).toLocaleString()));
  }
  return card;
}

async function showSites() {
  const sites = await readSites();
  const container = byId('sites');
  container.replaceChildren();
  const hosts = Object.keys(sites)
    .filter((host) => Object.keys(sites[host].notes || {}).length)
    .sort();
  if (!hosts.length) {
    container.appendChild(element('p', 'empty', 'No notes yet.'));
    return;
  }
  for (const host of hosts) {
    container.appendChild(element('h2', '', host));
    const notes = Object.entries(sites[host].notes).sort(
      ([, a], [, b]) => (b.updated || 0) - (a.updated || 0),
    );
    for (const [key, note] of notes) container.appendChild(noteCard(host, key, note));
  }
}

byId('export').addEventListener('click', async () => {
  const data = { format: 'list-stickers', version: 1, sites: await readSites() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = element('a');
  link.href = URL.createObjectURL(blob);
  link.download = `list-stickers-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

byId('import').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  let incoming;
  try {
    incoming = JSON.parse(await file.text());
    if (incoming.format !== 'list-stickers' || typeof incoming.sites !== 'object') {
      throw new Error('wrong format');
    }
  } catch {
    byId('message').textContent = 'This is not a file saved by this extension.';
    return;
  }
  // Loading adds to what is already here: for the same element the newer note wins.
  const existing = await readSites();
  const merged = {};
  let noteCount = 0;
  for (const [host, theirs] of Object.entries(incoming.sites)) {
    const ours = existing[host] || { selectors: [], notes: {} };
    const selectors = [...new Set([...(ours.selectors || []), ...(theirs.selectors || [])])];
    const notes = { ...(ours.notes || {}) };
    for (const [key, note] of Object.entries(theirs.notes || {})) {
      if (!notes[key] || (note.updated || 0) > (notes[key].updated || 0)) notes[key] = note;
      noteCount++;
    }
    // Where stickers were dragged to: what is already set here stays.
    const positions = { ...(theirs.positions || {}), ...(ours.positions || {}) };
    merged[SITE_PREFIX + host] = { selectors, notes, positions };
  }
  await chrome.storage.local.set(merged);
  byId('message').textContent = `Notes loaded: ${noteCount}.`;
});

chrome.storage.onChanged.addListener(showSites);
showSites();
