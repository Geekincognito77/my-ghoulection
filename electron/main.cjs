const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { openStore } = require('./store.cjs');
const { createReleaseService } = require('./releases.cjs');
const { createCatalog } = require('./catalog.cjs');
const { setupUpdates } = require('./updates.cjs');

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
    if (existing) return store.save({ ...existing, status: status === 'wanted' ? existing.status : 'owned' });
    let item;
    try {
      item = await catalog.details(url);
    } catch {
      // Offline or the page failed: add it from the checklist info alone.
      item = catalog.list().items.find((i) => i.url === url);
      if (!item) throw new Error('That item is not in the catalog.');
    }
    const doll = store.save(catalog.dollFrom(item, status === 'wanted' ? 'wanted' : 'owned'));
    try {
      const file = await releases.downloadImage(item.image, app.getPath('temp'), catalog.politeFetch);
      if (file) {
        store.addPhotos(doll.id, [file]);
        fs.rmSync(file, { force: true });
      }
    } catch {
      /* the doll is still added without a photo */
    }
    return store.get(doll.id);
  });

  ipcMain.handle('releases:cached', () => releases.cached());
  ipcMain.handle('releases:check', () => releases.check());
  ipcMain.handle('releases:wishlist', async (_e, item) => {
    const doll = store.save({
      status: 'wanted',
      dollName: item.title,
      targetPrice: item.price,
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
  mainWindow.webContents.once('did-finish-load', () => setTimeout(() => updates.checkQuietly(), 5000));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
