// "Check for updates": looks for a newer release on GitHub
// (github.com/Geekincognito77/my-ghoulection/releases), downloads it on request,
// and installs it on restart. Only works in the installed app, not in dev mode.
const { app, ipcMain } = require('electron');

function newer(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

function notesToText(notes) {
  if (!notes) return '';
  const raw = Array.isArray(notes) ? notes.map((n) => n.note || '').join('\n\n') : String(notes);
  return raw
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function friendly(err) {
  const msg = String(err?.message || err);
  if (/404|Cannot find latest|No published versions|HttpError: 4\d\d/i.test(msg)) return 'No releases have been published on GitHub yet.';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|net::/i.test(msg)) return 'Couldn’t reach GitHub. Check your internet connection and try again.';
  if (/rate limit/i.test(msg)) return 'GitHub is busy right now (rate limit). Try again in a little while.';
  return msg.split('\n')[0].slice(0, 200);
}

function setupUpdates(getWindow) {
  let autoUpdater = null;
  if (app.isPackaged) {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;
  }

  let state = { status: 'idle', current: app.getVersion() };
  const set = (next) => {
    state = { current: app.getVersion(), ...next };
    getWindow()?.webContents.send('updates:state', state);
    return state;
  };

  if (autoUpdater) {
    autoUpdater.on('download-progress', (p) => set({ ...state, status: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (info) => set({ ...state, status: 'ready', version: info.version, percent: 100 }));
    autoUpdater.on('error', (err) => {
      if (state.status === 'downloading') set({ ...state, status: 'error', message: friendly(err) });
    });
  }

  async function check({ quiet = false } = {}) {
    if (!autoUpdater) return set({ status: 'dev', message: 'Updates can only be checked in the installed app.' });
    if (['checking', 'downloading', 'ready'].includes(state.status)) return state;
    if (!quiet) set({ status: 'checking' });
    try {
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      if (info && newer(info.version, app.getVersion())) {
        return set({ status: 'available', version: info.version, notes: notesToText(info.releaseNotes), releaseDate: info.releaseDate });
      }
      return set({ status: 'none', checkedAt: new Date().toISOString() });
    } catch (err) {
      // A failed background check shouldn't nag; a failed manual one should explain.
      return quiet ? set({ status: 'idle' }) : set({ status: 'error', message: friendly(err) });
    }
  }

  ipcMain.handle('updates:state', () => state);
  ipcMain.handle('updates:check', () => check());
  ipcMain.handle('updates:download', async () => {
    if (!autoUpdater || state.status !== 'available') return state;
    set({ ...state, status: 'downloading', percent: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      set({ ...state, status: 'error', message: friendly(err) });
    }
    return state;
  });
  ipcMain.handle('updates:install', () => {
    if (autoUpdater && state.status === 'ready') setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return state;
  });

  return { checkQuietly: () => check({ quiet: true }) };
}

module.exports = { setupUpdates, newer };
