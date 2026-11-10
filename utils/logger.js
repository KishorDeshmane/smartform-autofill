
(function (root) {
  const STORAGE_KEY = 'sffa_logs';
  const MAX_LOGS = 300;
  let memoryLogs = [];
  const reportedStorageErrors = new Set();

  /** Returns the current local time formatted as HH:MM:SS. */
  function timestamp() {
    const d = new Date();
    return d.toTimeString().split(' ')[0];
  }

  root.__SFFA_STORAGE_ERROR__ = (message) => {
    if (reportedStorageErrors.has(message)) return;
    reportedStorageErrors.add(message);
    const entry = { time: timestamp(), message, level: 'error', ts: Date.now() };
    memoryLogs.push(entry);
    while (memoryLogs.length > MAX_LOGS) memoryLogs.shift();
  };

  /** Loads persisted logs and merges in memory-only entries not already persisted. */
  async function readLogs() {
    if (!root.SFFAExt) return memoryLogs.slice();
    const logs = await root.SFFAExt.store.get(STORAGE_KEY, []);
    const timestamps = new Set(logs.map(entry => entry.ts));
    return [...logs, ...memoryLogs.filter(entry => !timestamps.has(entry.ts))];
  }

  /** Persists logs when extension storage exists and maintains the in-memory fallback. */
  async function writeLogs(logs) {
    if (!root.SFFAExt?.hasExt) {
      memoryLogs = logs.slice();
      return false;
    }
    const saved = await root.SFFAExt.store.set(STORAGE_KEY, logs);
    if (saved) {
      memoryLogs = logs.slice();
      return true;
    }
    const storageErrors = memoryLogs.filter(entry => entry.message.startsWith('Storage '));
    memoryLogs = [...logs, ...storageErrors].slice(-MAX_LOGS);
    return false;
  }

  let writeQueue = Promise.resolve();
  /** Serializes log updates through a promise queue and caps the retained entries. */
  function enqueueLogMutation(mutator) {
    const result = writeQueue.then(async () => {
      const logs = await readLogs();
      const next = mutator(logs);
      while (next.length > MAX_LOGS) next.shift();
      const saved = await writeLogs(next);
      if (!saved) memoryLogs = next.slice();
      return next;
    });
    writeQueue = result.catch(() => {});
    return result;
  }

  /** Writes a timestamped entry to the console and queued storage, then returns the entry. */
  async function log(message, level = 'info') {
    const entry = {
      time: timestamp(),
      message,
      level,
      ts: Date.now()
    };

    const consoleFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : console.log;
    consoleFn(message);

    await enqueueLogMutation(logs => { logs.push(entry); return logs; });
    return entry;
  }

  /** Clears persisted and in-memory logs through the serialized mutation queue. */
  async function clear() {
    await enqueueLogMutation(() => []);
  }

  /** Returns the merged log entries from extension storage and memory. */
  async function getAll() {
    return readLogs();
  }

  const Logger = { log, clear, getAll };

  root.SFFALogger = Logger;
})(typeof window !== 'undefined' ? window : self);
