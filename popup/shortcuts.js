(function (root) {
  let initialized = false;

  /** Displays the shortcut binding reported by the browser command API. */
  async function init() {
    if (initialized) return;
    initialized = true;
    const section = document.getElementById('shortcutBinding');
    const chip = document.getElementById('actionShortcutChip');
    const link = document.getElementById('shortcutSettingsLink');
    if (!section || !chip) return;
    if (!root.SFFAExt?.commands?.getAll) {
      section.hidden = true;
      return;
    }

    const commands = await root.SFFAExt.commands.getAll();
    const action = commands.find(command => command.name === '_execute_action');
    if (!action?.shortcut) {
      chip.textContent = 'Not assigned';
      chip.setAttribute('aria-label', 'No keyboard shortcut assigned');
    } else {
      chip.textContent = action.shortcut;
      chip.setAttribute('aria-label', `Current extension shortcut: ${action.shortcut}`);
    }

    if (/Firefox/i.test(navigator.userAgent)) {
      if (link) {
        link.href = 'about:addons';
        link.textContent = 'Manage shortcuts in Firefox Add-ons';
      }
    }
  }

  root.SFFAShortcuts = { init };
})(window);
