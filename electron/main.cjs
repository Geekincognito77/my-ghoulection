const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { openStore } = require('./store.cjs');
const { createReleaseService } = require('./releases.cjs');
const { createCatalog } = require('./catalog.cjs');
const { setupUpdates } = require('./updates.cjs');
const { fromMattelProduct, estimateMsrp } = require('./details.cjs');

// ghoul://photo/<filename> serves pictures from the local photos folder.
protocol.registerSchemesAsPrivileged([
  { scheme: 'ghoul', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setAppUserModelId('com.myghoulection.app'); // needed for Windows notifications

let store;
let releases;
let catalog;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#140e1c',
    title: 'My Ghoulection',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Dropping a photo outside the drop zone shouldn't navigate the app away.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!process.env.VITE_DEV_SERVER_URL || !url.startsWith(process.env.VITE_DEV_SERVER_URL)) e.preventDefault();
  });
}

function registerIpc() {
  ipcMain.handle('dolls:list', () => store.list());
  ipcMain.handle('dolls:save', (_e, doll) => store.save(doll));
  ipcMain.handle('dolls:delete', (_e, id) => store.remove(id));
  ipcMain.handle('photos:add', (_e, dollId, paths) => store.addPhotos(dollId, Array.isArray(paths) ? paths : []));
  ipcMain.handle('photos:remove', (_e, photoId) => store.removePhoto(photoId));
  ipcMain.handle('photos:cover', (_e, photoId) => store.setCover(photoId));

  ipcMain.handle('data:exportCsv', async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export collection',
      defaultPath: path.join(app.getPath('documents'), `My Ghoulection ${stamp}.csv`),
      filters: [{ name: 'Spreadsheet (CSV)', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, store.toCsv(), 'utf8');
    return filePath;
  });

  ipcMain.handle('data:openFolder', () => shell.openPath(store.dataDir));

  ipcMain.handle('catalog:list', () => catalog.list());
  ipcMain.handle('catalog:refresh', () => catalog.refresh());
  ipcMain.handle('catalog:details', (_e, url) => catalog.details(url));
  ipcMain.handle('catalog:add', async (_e, url, status) => {
    const existing = store.list().find((d) => d.catalogUrl === url);
    if (existing) {
      if (status === 'wanted') return existing;
      return store.save({ ...existing, status: 'owned', pricePaid: existing.pricePaid ?? existing.msrp });
    }
    // Saved instantly from the catalog list; photo and remaining details follow in the background.
    const item = catalog.find(url);
    if (!item) throw new Error('That item is not in the catalog.');
    const doll = store.save(catalog.dollFrom(item, status === 'wanted' ? 'wanted' : 'owned'));
    enrichLater(doll.id);
    return doll;
  });

  ipcMain.handle('releases:cached', () => releases.cached());
  ipcMain.handle('releases:check', () => releases.check());
  ipcMain.handle('releases:wishlist', async (_e, item) => {
    const already = store.list().find((d) => (d.notes || '').includes(item.url));
    if (already) return already;
    const info = await mattelInfo(item.url, item.launchAt);
    const msrp = info.msrp ?? item.price ?? null;
    const doll = store.save({
      status: 'wanted',
      dollName: item.title.replace(/^Monster High\s+/i, '').replace(/\s+Doll$/i, ''),
      ...info,
      msrp,
      msrpEstimated: false,
      targetPrice: msrp,
      priority: 'High',
      notes: `Mattel Creations: ${item.url}${item.launchAt ? `\nDrops ${new Date(item.launchAt).toLocaleString()}` : ''}`,
      extras: [],
    });
    try {
      const file = await releases.downloadImage(item.image, app.getPath('temp'));
      if (file) {
        store.addPhotos(doll.id, [file]);
        fs.rmSync(file, { force: true });
      }
    } catch {
      /* the wishlist entry still stands without a photo */
    }
    return store.get(doll.id);
  });
}

// ---------- background details for dolls added from the catalog ----------
// MHcollector asks for 3 seconds between requests, so the page + photo for each new doll
// are fetched here, one doll at a time, without making you wait. Each doll updates on
// screen as soon as its photo arrives.
const enrichQueue = [];
let enriching = false;

function enrichLater(dollId) {
  if (!enrichQueue.includes(dollId)) enrichQueue.push(dollId);
  runEnrichment();
}

async function runEnrichment() {
  if (enriching) return;
  enriching = true;
  try {
    while (enrichQueue.length) {
      const id = enrichQueue.shift();
      try {
        await enrichDoll(id);
      } catch {
        /* offline or page failed: it'll be retried the next time the app starts */
      }
    }
  } finally {
    enriching = false;
  }
}

async function enrichDoll(id) {
  const doll = store.get(id);
  if (!doll?.catalogUrl) return;
  const item = await catalog.details(doll.catalogUrl, 'low');
  const blank = (v) => v === null || v === undefined || v === '';
  const fresh = store.get(id); // you may have edited it meanwhile: only fill what's still blank
  if (!fresh) return;
  const next = { ...fresh };
  const character = item.character && !/,/.test(item.character) ? item.character : null;
  if (blank(next.character) && character) next.character = character;
  if (blank(next.modelNumber) && item.modelNumber) next.modelNumber = item.modelNumber;
  if (next.dollName && next.character && next.dollName === next.character) next.dollName = null;
  if (JSON.stringify(next) !== JSON.stringify(fresh)) store.save(next);
  if (!fresh.photos.length && item.image) {
    const file = await releases.downloadImage(item.image, app.getPath('temp'), (u, init) => catalog.politeFetch(u, init, 'low'));
    if (file) {
      if (store.get(id)) store.addPhotos(id, [file]);
      fs.rmSync(file, { force: true });
    }
  }
  mainWindow?.webContents.send('dolls:changed');
}

// Character, line, year, generation, model number and MSRP for a Mattel Creations product.
async function mattelInfo(url, launchAt) {
  try {
    const product = await releases.fetchProduct(url);
    if (!product) return {};
    const info = fromMattelProduct(product, { launchAt, catalogItems: catalog.list().items });
    // Don't link to an MHcollector entry that another doll already uses.
    if (info.catalogUrl && store.list().some((d) => d.catalogUrl === info.catalogUrl)) delete info.catalogUrl;
    return info;
  } catch {
    return {};
  }
}

// Brings dolls saved by earlier versions up to date: fills in Mattel details and MSRP,
// and sets price paid to the MSRP where it's still blank. Never overwrites what you entered.
async function backfillDolls() {
  let changed = 0;
  const blank = (v) => v === null || v === undefined || v === '';
  for (const doll of store.list()) {
    const next = { ...doll };
    const mattelUrl = (/https:\/\/creations\.mattel\.com\/products\/[^\s]+/.exec(doll.notes || '') || [])[0];
    if (mattelUrl && blank(doll.modelNumber)) {
      const info = await mattelInfo(mattelUrl, null);
      for (const [k, v] of Object.entries(info)) if (blank(next[k]) && !blank(v)) next[k] = v;
      if (!blank(info.msrp) && blank(doll.msrp)) next.msrpEstimated = false;
      if (doll.status === 'wanted' && blank(next.targetPrice)) next.targetPrice = next.msrp;
      if (!blank(next.dollName) && /^Monster High /i.test(next.dollName)) next.dollName = next.dollName.replace(/^Monster High\s+/i, '').replace(/\s+Doll$/i, '');
    }
    // Added from the catalog but its photo/details never arrived (app closed, offline): try again.
    if (doll.catalogUrl && !doll.photos.length && blank(doll.modelNumber)) enrichLater(doll.id);
    if (doll.catalogUrl && blank(next.msrp)) {
      const item = catalog.find(doll.catalogUrl);
      const msrp = estimateMsrp(item);
      if (msrp != null) Object.assign(next, { msrp, msrpEstimated: true });
    }
    if (next.status === 'owned' && blank(next.pricePaid) && !blank(next.msrp)) next.pricePaid = next.msrp;
    if (JSON.stringify(next) !== JSON.stringify(doll)) {
      store.save(next);
      changed++;
    }
  }
  if (changed) mainWindow?.webContents.send('dolls:changed');
  return changed;
}

app.whenReady().then(() => {
  store = openStore(app.getPath('userData'));
  releases = createReleaseService(app.getPath('userData'));
  catalog = createCatalog(store.db);

  protocol.handle('ghoul', (request) => {
    const url = new URL(request.url);
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    return net.fetch(pathToFileURL(store.photoPath(name)).toString());
  });

  registerIpc();
  ipcMain.handle('app:version', () => app.getVersion());
  const updates = setupUpdates(() => mainWindow);
  createWindow();
  // Quietly look for a new version shortly after launch.
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => updates.checkQuietly(), 5000);
    backfillDolls().catch(() => {});
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
