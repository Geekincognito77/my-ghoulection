// The ONE place the screens talk to storage and the outside world.
//
// Desktop: calls go through Electron's preload bridge (window.ghoul) to the local
// SQLite database, photos folder and Mattel Creations checker.
//
// Web port: implement these same functions with fetch() calls to a small server
// (e.g. listDolls -> GET /api/dolls, addPhotoFiles -> POST multipart upload).
// The screens only use `api`, so nothing else has to change.

const desktop = typeof window !== 'undefined' ? window.ghoul : undefined;

const notReady = () => Promise.reject(new Error('Storage is only set up for the desktop app so far.'));

export const api = desktop
  ? {
      listDolls: () => desktop.listDolls(),
      saveDoll: (doll) => desktop.saveDoll(doll),
      deleteDoll: (id) => desktop.deleteDoll(id),
      // `files` are browser File objects (from a file picker or drag-and-drop).
      addPhotoFiles: (dollId, files) =>
        desktop.addPhotoPaths(dollId, Array.from(files).map((f) => desktop.pathForFile(f)).filter(Boolean)),
      removePhoto: (photoId) => desktop.removePhoto(photoId),
      setCover: (photoId) => desktop.setCover(photoId),
      photoUrl: (photo) => `ghoul://photo/${encodeURIComponent(photo.filename)}`,
      exportCsv: () => desktop.exportCsv(),
      openDataFolder: () => desktop.openDataFolder(),
      catalogList: () => desktop.catalogList(),
      catalogRefresh: () => desktop.catalogRefresh(),
      catalogDetails: (url) => desktop.catalogDetails(url),
      catalogAdd: (url, status) => desktop.catalogAdd(url, status),
      onDollsChanged: (cb) => desktop.onDollsChanged(cb),
      appVersion: () => desktop.appVersion(),
      updateState: () => desktop.updateState(),
      checkForUpdates: () => desktop.checkForUpdates(),
      downloadUpdate: () => desktop.downloadUpdate(),
      installUpdate: () => desktop.installUpdate(),
      onUpdateState: (cb) => desktop.onUpdateState(cb),
      cachedReleases: () => desktop.cachedReleases(),
      checkReleases: () => desktop.checkReleases(),
      wishlistRelease: (item) => desktop.wishlistRelease(item),
      canOpenDataFolder: true,
    }
  : {
      listDolls: async () => [],
      saveDoll: notReady,
      deleteDoll: notReady,
      addPhotoFiles: notReady,
      removePhoto: notReady,
      setCover: notReady,
      photoUrl: (photo) => photo.url || '',
      exportCsv: notReady,
      openDataFolder: notReady,
      catalogList: async () => ({ items: [], updatedAt: null }),
      catalogRefresh: notReady,
      catalogDetails: notReady,
      catalogAdd: notReady,
      onDollsChanged: () => () => {},
      appVersion: async () => 'web',
      updateState: async () => ({ status: 'dev', message: 'The web version is always up to date.' }),
      checkForUpdates: async () => ({ status: 'dev', message: 'The web version is always up to date.' }),
      downloadUpdate: notReady,
      installUpdate: notReady,
      onUpdateState: () => () => {},
      cachedReleases: async () => null,
      checkReleases: notReady,
      wishlistRelease: notReady,
      canOpenDataFolder: false,
    };
