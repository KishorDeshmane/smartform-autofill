// Test files list, upload handling and file-to-category mappings.

/** Sets or clears the file's selection for every available upload category. */
function toggleAllTypeSelections(fileId, checked, listEl = document.getElementById('fileList')) {
  if (!listEl || !fileId) return;
  const checkboxes = listEl.querySelectorAll(`.type-checkbox[data-file-id="${fileId}"]`);
  checkboxes.forEach(cb => {
    if (cb.disabled || cb.checked === checked) return;
    cb.checked = checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
}


/** Returns compatible, currently unmapped categories for the confirmation preview. */
async function getSoloFileAutoMappingProposals(files, settings, mappings) {
  if (files.length !== 1 || !settings?.automaticFileMapping) return [];
  return FILE_TYPE_OPTIONS.filter(type => isFileCompatibleWithType(files[0], type) && !(mappings[type.type] || []).length);
}

/** Loads stored file metadata and renders the popup's file and mapping controls. */
async function renderFileList() {
  const files = await SFFAStorage.getFiles();
  const settings = await SFFAStorage.getSettings();
  const mappings = await SFFAStorage.getMappings();
  const proposals = await getSoloFileAutoMappingProposals(files, settings, mappings);
  const preview = document.getElementById('autoMappingPreview');
  const autoMappingBadge = document.getElementById('autoMappingBadge');
  if (autoMappingBadge) autoMappingBadge.hidden = !settings.automaticFileMapping;
  preview.replaceChildren();
  preview.hidden = !settings.automaticFileMapping;
  if (settings.automaticFileMapping) {
    const { h } = window.SFFADom;
    preview.append(h('div', { class: 'auto-mapping-preview-title', text: proposals.length
      ? `Review suggested categories: ${proposals.map(item => item.label).join(', ')}. Existing mappings will be kept.`
      : files.length === 1 ? 'No unmapped compatible categories are available for this file.' : 'Automatic suggestions are available when exactly one file is stored. No mappings have changed.' }));
  }
  if (settings.automaticFileMapping && proposals.length) {
    const { h } = window.SFFADom;
    const confirmButton = h('button', { class: 'btn btn-small', type: 'button', text: 'Confirm suggested mappings' });
    confirmButton.addEventListener('click', async () => {
      if (!confirm(`Map the only stored file to these unmapped categories?\n\n${proposals.map(item => item.label).join(', ')}\n\nReview each mapping before filling; the file may not be the right document.`)) return;
      const current = await SFFAStorage.getMappings();
      const autoMappings = (await SFFAStorage.getSettings()).automaticFileMappings || [];
      for (const item of proposals) {
        if (!(current[item.type] || []).length) {
          current[item.type] = [files[0].id];
          autoMappings.push({ type: item.type, fileId: files[0].id });
        }
      }
      await SFFAStorage.setAllMappings(current);
      await SFFAStorage.updateSettings({ automaticFileMappings: autoMappings });
      await renderFileList();
    });
    preview.append(confirmButton);
  }
  const listEl = document.getElementById('fileList');
  listEl.replaceChildren();

  const filesDetails = document.getElementById('filesDetails');
  if (filesDetails && files.length) filesDetails.open = true;
  document.getElementById('fileCount').textContent =
    files.length ? `${files.length} file${files.length === 1 ? '' : 's'} stored` : '';

  if (!files.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No files stored. Add a test file if this page has an upload field.';
    listEl.appendChild(empty);
    return;
  }

  const fileIdToTypes = {};
  for (const [type, ids] of Object.entries(mappings)) {
    for (const id of ids) {
      (fileIdToTypes[id] ||= new Set()).add(type);
    }
  }

  const autoMappings = settings.automaticFileMappings || [];

  files.forEach(file => {
    const { h } = window.SFFADom;
    const activeTypes = fileIdToTypes[file.id] || new Set();

    const typePanel = h('div', { class: 'type-panel', 'data-file-id': file.id }, [
      h('div', { class: 'type-panel-actions' }, [
        h('button', {
          type: 'button',
          class: 'select-all-types',
          'data-file-id': file.id,
          'data-action': 'select-all-types',
          text: 'Select all types'
        }),
        h('button', {
          type: 'button',
          class: 'clear-all-types',
          'data-file-id': file.id,
          'data-action': 'clear-all-types',
          text: 'Clear all'
        })
      ]),
      ...FILE_TYPE_OPTIONS.map(o => h('label', { class: 'type-check' }, [
        h('input', {
          type: 'checkbox', class: 'type-checkbox',
          'data-file-id': file.id, 'data-type': o.type,
          checked: activeTypes.has(o.type)
        }),
        h('span', { text: `${o.tag} ${o.label}` })
      ]))
    ]);
    const mappingDropdown = h('details', { class: 'file-mapping-dropdown' }, [
      h('summary', { text: `Categories (${activeTypes.size})` }),
      typePanel
    ]);

    const displayName = file.label || file.name;
    const li = h('li', { class: 'file-item' }, [
      h('span', { class: 'file-icon', 'data-icon': iconNameForType(file), 'aria-hidden': 'true', text: iconForType(file) }),
      h('div', { class: 'file-meta' }, [
        h('div', { class: 'file-name', title: displayName, text: displayName }),
        h('div', { class: 'file-sub', text: `${file.type} · ${formatBytes(file.size)}` }),
        ...(autoMappings.some(mapping => mapping.fileId === file.id && (mappings[mapping.type] || []).includes(file.id))
          ? [h('span', { class: 'auto-mapped-badge', text: 'Auto-mapped · review before use' })] : [])
      ]),
      mappingDropdown,
      h('div', { class: 'file-actions' }, [
        h('button', { type: 'button', 'data-action': 'rename', 'data-id': file.id, title: 'Rename', 'aria-label': `Rename ${displayName}`, class: 'icon-btn', 'data-icon': 'fileText' }),
        h('button', { type: 'button', 'data-action': 'delete', 'data-id': file.id, title: 'Delete', 'aria-label': `Delete ${displayName}`, class: 'icon-btn', 'data-icon': 'trash' })
      ]),
    ]);
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('[data-action="select-all-types"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.fileId;
      toggleAllTypeSelections(id, true, listEl);
    });
  });

  listEl.querySelectorAll('[data-action="clear-all-types"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.fileId;
      toggleAllTypeSelections(id, false, listEl);
    });
  });

  listEl.querySelectorAll('.type-checkbox').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const fileId = e.target.dataset.fileId;
      const type = e.target.dataset.type;
      const settings = await SFFAStorage.getSettings();
      const autoMappings = (settings.automaticFileMappings || []).filter(mapping => mapping.type !== type);
      await SFFAStorage.updateSettings({ automaticFileMappings: autoMappings });
      if (e.target.checked) {
        await SFFAStorage.addMappingFile(type, fileId);
      } else {
        await SFFAStorage.removeMappingFile(type, fileId);
      }
      renderFileList();
    });
  });

  listEl.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const updatedFiles = await SFFAStorage.deleteFile(e.currentTarget.dataset.id);
      if (!Array.isArray(updatedFiles)) {
        showToast('Could not delete the file because its metadata could not be saved');
        return;
      }
      renderFileList();
      showToast('File deleted');
    });
  });

  listEl.querySelectorAll('button[data-action="rename"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const files = await SFFAStorage.getFiles();
      const f = files.find(x => x.id === id);
      const newLabel = prompt('Rename file / label:', f?.label || f?.name || '');
      if (newLabel && newLabel.trim()) {
        await SFFAStorage.renameFile(id, newLabel.trim());
        renderFileList();
      }
    });
  });

}

/** Stores selected files, including their content, and refreshes the file list. */
async function handleFilesSelected(fileListObj) {
  const isSupported = window.SFFAFileTypes
    ? window.SFFAFileTypes.isSupportedUploadFile
    : (file) => ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type);
  const incoming = Array.from(fileListObj);
  const rejected = [];
  const newRecords = [];

  for (const file of incoming) {
    if (!isSupported(file)) {
      rejected.push(file.name);
      continue;
    }
    newRecords.push({
      id: uid(),
      name: file.name,
      label: file.name,
      type: file.type,
      size: file.size,
      blob: file,
      createdAt: Date.now()
    });
  }

  if (newRecords.length) {
    const { failures } = await SFFAStorage.addFileRecordsWithBlobs(newRecords);
    const savedCount = newRecords.length - failures.length;
    if (savedCount > 0) showToast(`${savedCount} file${savedCount === 1 ? '' : 's'} added`);
    if (failures.length) {
      showToast(`${failures.length} file(s) could not be saved (storage error)`);
    }
  }
  if (rejected.length) showToast(`Skipped ${rejected.length} unsupported file(s)`);

  renderFileList();
}
