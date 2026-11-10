
(function (root) {
  const KEYS = {
    FILES: 'sffa_files',
    MAPPINGS: 'sffa_mappings',
    SETTINGS: 'sffa_settings',
    LAST_DATA: 'sffa_last_data',
    LAST_FILLED_DISPLAY: 'sffa_last_filled_display',
    SITE_CONFIGS: 'sffa_site_configs',
    USED_MOBILES: 'sffa_used_mobiles',
    USED_EMAILS: 'sffa_used_emails',
    LAST_ACTIVITY: 'sffa_last_activity'
  };

  const DEFAULT_SETTINGS = {
    freshDataEveryRun: true,
    captureActivityDuringFill: false,
    automaticFileMapping: false,
    reuseMappedFileAcrossFields: false,
    dryRunPageActions: true,
    actionDryRunOffConfirmed: false,
    pickedClickIntervalMs: null, // wait between clicks for a picked element with many matches; null = 1 s default

    redactPathsInReports: true,
    identityFormat: 'GENERIC',
    dataLocale: 'IN',
    dataSeed: '',
    regNumberFormat: '{LETTERS}{DIGITS}',
    testPinCodes: ['411001', '411007', '411038', '411045', '110001', '560001'],
    firstNames: ['Rahul', 'Amit', 'Priya', 'Neha', 'Rohit', 'Sneha', 'Akash', 'Pooja', 'Vikas', 'Anjali'],
    lastNames: ['Sharma', 'Patil', 'Deshmukh', 'Singh', 'Kulkarni', 'Joshi', 'Pawar', 'Jadhav'],
    richTextValue: 'Sample QA content for verification.',
    autocompleteQuery: 'QA',
    multiSelectCount: 2,
    linkCheckLimit: 25,
    spellingIgnoreList: [],
    spellingDictionary: [],
    allowedTestEnvironments: [],
    autoClearAfterDays: 0,
    aiEndpointAllowlist: ['https://api.openai.com'],
    aiMaskPageUrl: true,
    aiMaskPageTitle: true,
    credentialsBySite: {},
    repeatRowsBySite: {},
    multiSelectCount: 2
  };

  /** Reads a settings key from extension storage and returns its fallback if absent or unavailable. */
  async function get(key, fallback) {
    if (!root.SFFAExt) return fallback;
    return root.SFFAExt.store.get(key, fallback);
  }

  /** Writes one settings key to extension storage and reports whether the write succeeded. */
  async function set(key, value) {
    if (!root.SFFAExt) return false;
    const saved = await root.SFFAExt.store.set(key, value);
    if (saved && key !== KEYS.LAST_ACTIVITY) await root.SFFAExt.store.set(KEYS.LAST_ACTIVITY, Date.now());
    return saved;
  }


  /** Reads a Blob into an ArrayBuffer for legacy metadata serialization. */
  async function blobToArrayBuffer(blob) {
    return blob.arrayBuffer();
  }

  /** Encodes an ArrayBuffer as a base64 string. */
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  /** Decodes base64 data into a Blob using the supplied MIME type. */
  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  }

  /** Parses a data URL and returns its decoded Blob, using fallbackMime when omitted. */
  function dataUrlToBlob(dataUrl, fallbackMime) {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(5, comma);
    const mime = (header.split(';')[0]) || fallbackMime || 'application/octet-stream';
    return base64ToBlob(dataUrl.slice(comma + 1), mime);
  }

  /** Returns file metadata from settings without hydrating file contents. */
  async function getFiles() {
    return get(KEYS.FILES, []);
  }

  /** Stores one file's Blob in IndexedDB and adds its metadata to the settings list. */
  async function addFile(file) {
    const files = await getFiles();
    files.push(file);
    await set(KEYS.FILES, files);
    return files;
  }

  /** Stores multiple files and returns their metadata records. */
  async function addFiles(newFiles) {
    if (!newFiles || !newFiles.length) return getFiles();
    const files = await getFiles();
    const next = files.concat(newFiles);
    if (!await set(KEYS.FILES, next)) throw new Error('Could not save file metadata to extension storage');
    return next;
  }


  /** Returns the IndexedDB adapter or throws when it is unavailable. */
  function requireIdb() {
    if (!root.SFFAIndexedDB) {
      throw new Error('File storage is unavailable in this context (IndexedDB helper not loaded)');
    }
    return root.SFFAIndexedDB;
  }

  /** Persists each record's Blob and merges successful file metadata into settings. */
  async function addFileRecordsWithBlobs(records) {
    const idb = requireIdb();
    if (!records || !records.length) return getFiles();
    const metas = [];
    const failures = [];
    for (const r of records) {
      try {
        await idb.putFile({
          id: r.id,
          blob: r.blob,
          filename: r.name,
          mimeType: r.type,
          size: r.size,
          createdAt: r.createdAt || Date.now(),
          updatedAt: r.createdAt || Date.now()
        });
        metas.push({
          id: r.id, name: r.name, label: r.label || r.name, type: r.type,
          size: r.size, createdAt: r.createdAt || Date.now()
        });
      } catch (e) {
        failures.push({ name: r.name, error: e.message });
      }
    }
    if (metas.length) {
      try {
        const saved = await root.SFFAStorage.addFiles(metas);
        if (!Array.isArray(saved)) throw new Error('Could not save file metadata to extension storage');
      }
      catch (error) {
        for (const meta of metas) {
          await idb.deleteFile(meta.id).catch(() => {});
          failures.push({ name: meta.name, error: error.message });
        }
      }
    }
    return { files: await getFiles(), failures };
  }

  /** Retrieves the Blob for a stored file ID, returning null if the record is missing. */
  async function getFileBlob(id) {
    const idb = requireIdb();
    const rec = await idb.getFile(id).catch(() => null);
    if (rec && rec.blob) return rec.blob;
    const files = await getFiles();
    const meta = files.find(f => f.id === id);
    if (meta && meta.dataUrl) return dataUrlToBlob(meta.dataUrl, meta.type);
    return null;
  }

  /** Removes a file's blob, metadata, and mapping references from extension storage. */
  async function deleteFile(id) {
    const files = await getFiles();
    const next = files.filter(f => f.id !== id);
    if (!await set(KEYS.FILES, next)) throw new Error('Could not save the file list; the file was not deleted');
    if (root.SFFAIndexedDB) {
      try { await root.SFFAIndexedDB.deleteFile(id); }
      catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    }
    const mappings = await getMappings();
    const nextMappings = {};
    for (const [type, ids] of Object.entries(mappings)) {
      const filtered = (Array.isArray(ids) ? ids : [ids]).filter(fid => fid !== id);
      if (filtered.length) nextMappings[type] = filtered;
    }
    await set(KEYS.MAPPINGS, nextMappings);
    return next;
  }

  /** Moves legacy embedded file data into IndexedDB and reports migrated or failed records. */
  async function migrateLegacyFiles() {
    if (!root.SFFAIndexedDB || !root.SFFAIndexedDB.isAvailable()) {
      return { ok: false, migrated: 0, failed: 0, errors: [], reason: 'IndexedDB unavailable in this context' };
    }
    const idb = root.SFFAIndexedDB;
    const files = await getFiles();
    const legacy = files.filter(f => !!f.dataUrl);
    if (!legacy.length) return { ok: true, migrated: 0, failed: 0, errors: [] };

    let migrated = 0;
    const errors = [];
    for (const record of legacy) {
      try {
        const existing = await idb.getFile(record.id).catch(() => null);
        if (!existing) {
          const blob = dataUrlToBlob(record.dataUrl, record.type);
          await idb.putFile({
            id: record.id,
            blob,
            filename: record.name || record.label || 'file',
            mimeType: record.type,
            size: record.size || blob.size,
            createdAt: record.createdAt || Date.now(),
            updatedAt: Date.now()
          });
        }
        delete record.dataUrl;
        record.migratedAt = Date.now();
        migrated++;
      } catch (e) {
        errors.push({ id: record.id, name: record.name, error: e.message });
      }
    }
    await set(KEYS.FILES, files);
    return { ok: true, migrated, failed: errors.length, errors };
  }

  /** Loads requested file contents from IndexedDB or the background and attaches them to records. */
  async function hydrateFileContents(fileRecords) {
    if (!fileRecords || !fileRecords.length) return fileRecords;
    const needed = fileRecords.filter(f => !f.dataUrl && !f.base64).map(f => f.id);
    if (!needed.length) return fileRecords;
    try {
      const response = await root.SFFAExt?.api.sendRuntimeMessage({ type: 'SFFA_GET_FILE_CONTENTS', fileIds: needed });
      if (response && response.ok && Array.isArray(response.files)) {
        const byId = new Map(response.files.map(f => [f.id, f]));
        for (const rec of fileRecords) {
          const hydrated = byId.get(rec.id);
          if (hydrated && typeof hydrated.base64 === 'string') rec.base64 = hydrated.base64;
        }
      }
    } catch (e) { /* Best-effort fallback: failure is intentionally non-fatal. */ }
    return fileRecords;
  }

  /** Updates a file record's user-visible label and returns whether it was found. */
  async function renameFile(id, newLabel) {
    const files = await getFiles();
    const f = files.find(x => x.id === id);
    if (f) f.label = newLabel;
    await set(KEYS.FILES, files);
    return files;
  }

  /** Loads and normalizes the mapping from upload categories to file IDs. */
  async function getMappings() {
    const raw = await get(KEYS.MAPPINGS, {});
    const normalized = {};
    for (const [type, val] of Object.entries(raw)) {
      normalized[type] = Array.isArray(val) ? val : (val ? [val] : []);
    }
    return normalized;
  }

  /** Replaces all file-category mappings with the supplied mapping object. */
  async function setAllMappings(mappings) {
    await set(KEYS.MAPPINGS, mappings || {});
    return mappings;
  }

  /** Returns the file IDs mapped to one category, normalized as an array. */
  async function getMappedFileIds(type) {
    const mappings = await getMappings();
    return mappings[type] || [];
  }

  /** Adds a file ID to a category mapping without duplicating existing IDs. */
  async function addMappingFile(type, fileId) {
    const mappings = await getMappings();
    const list = mappings[type] || [];
    if (!list.includes(fileId)) list.push(fileId);
    mappings[type] = list;
    await set(KEYS.MAPPINGS, mappings);
    return mappings;
  }

  /** Removes one file ID from a category mapping. */
  async function removeMappingFile(type, fileId) {
    const mappings = await getMappings();
    mappings[type] = (mappings[type] || []).filter(id => id !== fileId);
    if (!mappings[type].length) delete mappings[type];
    await set(KEYS.MAPPINGS, mappings);
    return mappings;
  }

  /** Replaces a category's mapped file IDs with the supplied list. */
  async function setMappingFiles(type, fileIds) {
    const mappings = await getMappings();
    if (fileIds.length) mappings[type] = fileIds;
    else delete mappings[type];
    await set(KEYS.MAPPINGS, mappings);
    return mappings;
  }

  /** Sets a category's mapping to a single file ID. */
  async function setMapping(type, fileId) {
    return setMappingFiles(type, fileId ? [fileId] : []);
  }

  /** Removes all file mappings for one category. */
  async function removeMapping(type) {
    const mappings = await getMappings();
    delete mappings[type];
    await set(KEYS.MAPPINGS, mappings);
    return mappings;
  }

  /** Loads generation settings and normalizes configured name and PIN lists. */
  async function getSettings() {
    const stored = await get(KEYS.SETTINGS, {});
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    for (const key of ['firstNames', 'lastNames', 'testPinCodes']) {
      const values = Array.isArray(settings[key]) ? settings[key].filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : [];
      settings[key] = values.length ? values : [...DEFAULT_SETTINGS[key]];
    }
    const ageDays = Number(settings.autoClearAfterDays) || 0;
    const lastActivity = await get(KEYS.LAST_ACTIVITY, Date.now());
    if (ageDays > 0 && Date.now() - Number(lastActivity) >= ageDays * 86400000) {
      await clearAllData();
      return { ...DEFAULT_SETTINGS, autoClearAfterDays: ageDays };
    }
    return settings;
  }

  /** Removes stored files and their category mappings while preserving other settings. */
  async function clearFiles() {
    if (root.SFFAIndexedDB?.clearFiles) await root.SFFAIndexedDB.clearFiles();
    await set(KEYS.FILES, []);
    await set(KEYS.MAPPINGS, {});
    return true;
  }

  /** Clears saved site credentials while retaining the other user settings. */
  async function clearCredentials() {
    return updateSettings({ credentialsBySite: {} });
  }

  /** Clears extension-local data, retaining only the user's automatic-clear interval. */
  async function clearAllData() {
    const prior = await get(KEYS.SETTINGS, {});
    const autoClearAfterDays = Number(prior?.autoClearAfterDays) || 0;
    if (root.SFFAIndexedDB?.clearFiles) await root.SFFAIndexedDB.clearFiles();
    if (!root.SFFAExt?.store?.clear || !await root.SFFAExt.store.clear()) throw new Error('Could not clear extension storage');
    await root.SFFAExt.store.set(KEYS.SETTINGS, { ...DEFAULT_SETTINGS, autoClearAfterDays });
    await root.SFFAExt.store.set(KEYS.LAST_ACTIVITY, Date.now());
    return true;
  }

  /** Merges a partial settings object into the saved settings and persists it. */
  async function updateSettings(patch) {
    const current = await getSettings();
    const next = { ...current, ...patch };
    await set(KEYS.SETTINGS, next);
    return next;
  }

  /** Retrieves the last generated test-data object. */
  async function getLastData() {
    return get(KEYS.LAST_DATA, null);
  }

  /** Persists the last generated test-data object. */
  async function setLastData(data) {
    await set(KEYS.LAST_DATA, data);
  }

  /** Retrieves the last fill summary stored for display. */
  async function getLastFilledDisplay() {
    return get(KEYS.LAST_FILLED_DISPLAY, null);
  }

  /** Persists the last fill summary used by the popup. */
  async function setLastFilledDisplay(data) {
    await set(KEYS.LAST_FILLED_DISPLAY, data);
  }

  /** Retrieves all saved per-host custom selector configurations. */
  async function getSiteConfigs() {
    return get(KEYS.SITE_CONFIGS, {});
  }

  /** Retrieves the saved selector configuration for one hostname. */
  async function getSiteConfig(hostname) {
    const all = await getSiteConfigs();
    return all[hostname] || null;
  }

  /** Saves a per-host selector configuration under the supplied hostname. */
  async function setSiteConfig(hostname, config) {
    const all = await getSiteConfigs();
    all[hostname] = config;
    await set(KEYS.SITE_CONFIGS, all);
    return all;
  }

  /** Deletes the saved selector configuration for one hostname. */
  async function deleteSiteConfig(hostname) {
    const all = await getSiteConfigs();
    delete all[hostname];
    await set(KEYS.SITE_CONFIGS, all);
  }

  /** Retrieves previously generated values tracked for the given kind. */
  async function getUsed(kind) {
    const key = kind === 'mobile' ? KEYS.USED_MOBILES : KEYS.USED_EMAILS;
    return get(key, []);
  }

  /** Adds a generated value to the bounded history for its kind. */
  async function addUsed(kind, value) {
    const key = kind === 'mobile' ? KEYS.USED_MOBILES : KEYS.USED_EMAILS;
    const list = await get(key, []);
    list.push(value);
    while (list.length > 500) list.shift();
    await set(key, list);
  }

  root.SFFAStorage = {
    KEYS,
    DEFAULT_SETTINGS,
    getFiles, addFile, addFiles, deleteFile, renameFile,
    addFileRecordsWithBlobs, getFileBlob, migrateLegacyFiles, hydrateFileContents,
    arrayBufferToBase64, base64ToBlob, dataUrlToBlob, blobToArrayBuffer,
    getMappings, getMappedFileIds, addMappingFile, removeMappingFile, setMappingFiles, setAllMappings,
    setMapping, removeMapping,
    getSettings, updateSettings, clearFiles, clearCredentials, clearAllData,
    getLastData, setLastData,
    getLastFilledDisplay, setLastFilledDisplay,
    getSiteConfigs, getSiteConfig, setSiteConfig, deleteSiteConfig,
    getUsed, addUsed
  };
  const mutationNames = [
    'addFile', 'addFiles', 'deleteFile', 'renameFile', 'migrateLegacyFiles',
    'addMappingFile', 'removeMappingFile', 'setMappingFiles', 'setAllMappings',
    'setMapping', 'removeMapping', 'updateSettings', 'setLastData',
    'setLastFilledDisplay', 'setSiteConfig', 'deleteSiteConfig', 'addUsed', 'clearFiles', 'clearCredentials', 'clearAllData'
  ];
  let mutationQueue = Promise.resolve();
  for (const name of mutationNames) {
    const operation = root.SFFAStorage[name];
    root.SFFAStorage[name] = (...args) => {
      if (!root.__SFFA_STORAGE_HOST__) {
        const request = root.SFFAExt?.api.sendRuntimeMessage({ type: 'SFFA_STORAGE_MUTATION', name, args }, { timeoutMs: 10000 });
        return request ? request.then(response => response?.ok ? response.value : null).catch(() => null) : null;
      }
      const result = mutationQueue.then(() => operation(...args));
      mutationQueue = result.catch(() => {});
      return result;
    };
  }
  root.SFFAStorage.mutationNames = mutationNames;
})(typeof window !== 'undefined' ? window : self);
