
(function (root) {
  /** Decodes a data URL into a File using the supplied name and optional MIME override. */
  function dataUrlToFile(dataUrl, filename, mimeType, FileCtor = File) {
    const arr = dataUrl.split(',');
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new FileCtor([u8arr], filename, { type: mimeType });
  }

  /** Decodes a base64 string into a File with the supplied metadata. */
  function base64ToFile(base64, filename, mimeType, FileCtor = File) {
    const bstr = atob(base64);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new FileCtor([u8arr], filename, { type: mimeType });
  }

  /** Converts a stored record into a File, or returns null when its content is unavailable. */
  function materializeFile(record, FileCtor = File) {
    if (typeof record.base64 === 'string') return base64ToFile(record.base64, record.name, record.type, FileCtor);
    if (record.dataUrl) return dataUrlToFile(record.dataUrl, record.name, record.type, FileCtor);
    return null;
  }

  /** Splits an input accept attribute into normalized extension, MIME, or wildcard tokens. */
  function parseAcceptAttribute(accept) {
    if (!accept) return null;
    const tokens = accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return tokens.length ? tokens : null;
  }

  /** Checks a file record's name and MIME metadata against parsed accept tokens. */
  function fileMatchesAccept(fileRecord, acceptTokens) {
    if (!acceptTokens) return true;
    const name = (fileRecord.name || '').toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    const mime = (fileRecord.type || '').toLowerCase();
    const knownMimes = root.SFFAFileTypes?.SUPPORTED_UPLOAD_EXTENSIONS?.[ext] || [];
    return acceptTokens.some(token => {
      if (token === '*' || token === '*/*') return true;
      if (token.startsWith('.')) return ext === token;
      if (token.endsWith('/*')) return mime.startsWith(token.slice(0, -1)) || knownMimes.some(type => type.startsWith(token.slice(0, -1)));
      return mime === token || knownMimes.includes(token);
    });
  }

  /** Attaches compatible stored files to a live file input and returns a structured result. */
  function assignFilesToInput(inputEl, fileRecords) {
    try {
      if (!inputEl || inputEl.tagName !== 'INPUT' || inputEl.type !== 'file') {
        return { success: false, reason: 'Not a file input element' };
      }
      if (!inputEl.isConnected) {
        return { success: false, reason: 'Field is no longer attached to the page — it was re-rendered by the site before this file step ran', stale: true };
      }
      if (inputEl.matches(':disabled')) {
        return { success: false, reason: 'File input is disabled' };
      }
      if (!fileRecords || !fileRecords.length) {
        return { success: false, reason: 'No files provided' };
      }

      const acceptTokens = parseAcceptAttribute(inputEl.getAttribute('accept'));
      const compatibleRecords = acceptTokens
        ? fileRecords.filter(r => fileMatchesAccept(r, acceptTokens))
        : fileRecords;
      const rejectedByAccept = acceptTokens
        ? fileRecords.filter(r => !fileMatchesAccept(r, acceptTokens)).map(() => 'rejected')
        : [];

      if (!compatibleRecords.length) {
        return {
          success: false,
          reason: `File type is not accepted by this field (accepts: ${inputEl.getAttribute('accept')})`,
          rejectedByAccept
        };
      }

      const allowMultiple = inputEl.multiple;
      const recordsToAttach = allowMultiple ? compatibleRecords : compatibleRecords.slice(0, 1);
      const skippedCount = fileRecords.length - recordsToAttach.length;

      let unavailableCount = 0;
      const attachedRecordIds = [];
      const targetWindow = inputEl.ownerDocument.defaultView || window;
      const dataTransfer = new targetWindow.DataTransfer();
      for (const record of recordsToAttach) {
        const file = materializeFile(record, targetWindow.File);
        if (!file) { unavailableCount++; continue; }
        dataTransfer.items.add(file);
        attachedRecordIds.push(record.id);
      }
      if (dataTransfer.items.length === 0) {
        return {
          success: false,
          reason: unavailableCount
            ? `File content could not be retrieved for ${unavailableCount} mapped file(s) (VERIFICATION_UNAVAILABLE — background storage lookup failed)`
            : 'No file content available to attach',
          contentUnavailable: unavailableCount ? Array(unavailableCount).fill('unavailable') : undefined
        };
      }
      inputEl.files = dataTransfer.files;
      const attachedCount = dataTransfer.items.length;
      const setOk = !!(inputEl.files && inputEl.files.length === attachedCount);

      inputEl.dispatchEvent(new targetWindow.Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new targetWindow.Event('change', { bubbles: true }));

      // Many apps read the file in their change handler, then clear the input (value = '') or
      // re-render it. The page still received the file, so that counts as attached.
      const consumedByPage = setOk && (!inputEl.isConnected || !inputEl.files || inputEl.files.length === 0);
      if (consumedByPage || (inputEl.isConnected && inputEl.files && inputEl.files.length === attachedCount)) {
        return {
          success: true,
          attached: attachedCount,
          attachedRecordIds,
          consumedByPage,
          skipped: skippedCount + unavailableCount,
          rejectedByAccept: rejectedByAccept.length ? rejectedByAccept : undefined,
          contentUnavailable: unavailableCount ? Array(unavailableCount).fill('unavailable') : undefined
        };
      }
      return { success: false, reason: 'File upload requires manual selection' };
    } catch (e) {
      return { success: false, reason: 'File upload requires manual selection' };
    }
  }

  /** Convenience wrapper that assigns one file through the multi-file implementation. */
  function assignFileToInput(inputEl, fileRecord) {
    return assignFilesToInput(inputEl, fileRecord ? [fileRecord] : []);
  }

  /** True when a stored file record fits an input's accept attribute (or the input accepts anything). */
  function recordFitsInput(record, inputEl) {
    const tokens = parseAcceptAttribute(inputEl?.getAttribute?.('accept'));
    return !tokens || fileMatchesAccept(record, tokens);
  }

  root.SFFAFileUploader = { assignFilesToInput, assignFileToInput, dataUrlToFile, base64ToFile, recordFitsInput };
})(window);
