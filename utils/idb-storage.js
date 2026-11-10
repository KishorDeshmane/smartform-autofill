(function (root) {
  const DB_NAME = 'SFFAFilesDB';
  const DB_VERSION = 1;
  const STORE = 'files';

  let dbPromise = null;

  /** Reports whether IndexedDB is exposed in the current execution context. */
  function isAvailable() {
    return typeof indexedDB !== 'undefined';
  }

  /** Opens or reuses the file database, creating its object store during the first upgrade. */
  function openDB() {
    if (!isAvailable()) {
      return Promise.reject(new Error('IndexedDB is not available in this context'));
    }
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => { dbPromise = null; };
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('Failed to open SFFAFilesDB'));
      req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open tab - close other extension popups/tabs and retry'));
    });
    dbPromise = dbPromise.catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }

  /** Runs a callback against the files object store and resolves when its transaction completes. */
  function runTx(storeMode, work) {
    return openDB().then(db => new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(STORE, storeMode);
      } catch (e) {
        reject(e);
        return;
      }
      const store = tx.objectStore(STORE);
      let result;
      try {
        result = work(store);
      } catch (e) {
        reject(e);
        return;
      }
      tx.oncomplete = () => resolve(result && result.__pending ? result.value : result);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted (quota exceeded or file too large?)'));
    }));
  }

  /** Wraps an IndexedDB request so its result can be returned after transaction completion. */
  function req(store, method, ...args) {
    const holder = { __pending: true, value: undefined };
    const r = store[method](...args);
    r.onsuccess = () => { holder.value = r.result; };
    return holder;
  }

  /** Validates and stores a file Blob with normalized metadata; rejects invalid records or DB errors. */
  async function putFile(record) {
    if (!record || !record.id) throw new Error('putFile requires an id');
    if (!(record.blob instanceof Blob)) throw new Error('putFile requires a Blob/File');
    const entry = {
      id: record.id,
      blob: record.blob,
      filename: record.filename || 'file',
      mimeType: record.mimeType || record.blob.type || 'application/octet-stream',
      size: typeof record.size === 'number' ? record.size : record.blob.size,
      createdAt: record.createdAt || Date.now(),
      updatedAt: record.updatedAt || Date.now(),
      tags: record.tags || []
    };
    await runTx('readwrite', (store) => store.put(entry));
    return entry;
  }

  /** Retrieves one stored file record by ID, or undefined when no record matches. */
  async function getFile(id) {
    return runTx('readonly', (store) => req(store, 'get', id));
  }

  /** Retrieves existing records for the supplied IDs; returns an empty array for no IDs. */
  async function getFiles(ids) {
    if (!ids || !ids.length) return [];
    return runTx('readonly', (store) => {
      const holder = { __pending: true, value: [] };
      let remaining = ids.length;
      ids.forEach((id) => {
        const r = store.get(id);
        r.onsuccess = () => {
          if (r.result) holder.value.push(r.result);
          remaining--;
        };
      });
      return holder;
    });
  }

  /** Deletes a stored record by ID and returns true after the transaction completes. */
  async function deleteFile(id) {
    await runTx('readwrite', (store) => store.delete(id));
    return true;
  }

  /** Returns the keys of all stored file records. */
  async function getAllIds() {
    return runTx('readonly', (store) => req(store, 'getAllKeys'));
  }

  /** Deletes every stored test-file blob from the IndexedDB file store. */
  async function clearFiles() {
    await runTx('readwrite', store => store.clear());
    return true;
  }

  /** Returns browser storage usage and quota when supported, otherwise a support/error result. */
  async function estimateUsage() {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return { supported: false };
    }
    try {
      const { usage, quota } = await navigator.storage.estimate();
      return { supported: true, usage, quota };
    } catch (e) {
      return { supported: false, error: e.message };
    }
  }

  root.SFFAIndexedDB = {
    isAvailable, openDB, putFile, getFile, getFiles, deleteFile, getAllIds, clearFiles, estimateUsage
  };
})(typeof self !== 'undefined' ? self : this);
