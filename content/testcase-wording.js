// SmartForm AutoFill — plain-language wording for generated test cases.
// The generator decides WHICH checks apply (from the page); this file decides HOW each check is
// written, so a client or business tester can read and run it without technical knowledge.
// Each entry: { t: title, s: steps (after "Open the page"), e: expected result, d?: test data, n?: note }.
// Every function receives a context `c` (see contextFor in testcase-generator.js):
//   c.N = element name as people see it ('"Email" box'), c.P = page name ('"Register" page'),
//   c.submit = the form's submit button ('the "Save" button'), c.el = the element, plus helpers.
(function (root) {
  /** Fills all other required fields, a step most validation cases need. */
  const fillOthers = 'Fill in all the other required fields with valid data.';
  const L = s => s; // readability marker for literal steps

  const W = {
    // ---------- Accessibility ----------
    'Verify accessible name and label association': {
      t: c => `Check that the ${c.N} has a clear label`,
      s: c => [`Look at the ${c.N} and the text next to it.`, `Turn on a screen reader (for example NVDA or VoiceOver) and move to the ${c.N}.`],
      e: c => `A visible label explains what the ${c.N} is for, and the screen reader reads out the same label.`
    },
    'Verify disabled control keyboard behavior': {
      t: c => `Check that the disabled ${c.N} cannot be used`,
      s: c => [L('Press Tab to move through the page.'), `Try to click the ${c.N}.`],
      e: c => `The ${c.N} cannot be changed or clicked while it is disabled, and it is clear why.`
    },
    'Verify keyboard access and visible focus': {
      t: c => `Check that the ${c.N} can be used with the keyboard only`,
      s: c => [`Press Tab until the ${c.N} is highlighted.`, L('Use it with the keyboard (Enter, Space or the arrow keys).'), L('Press Tab again to move on.')],
      e: c => `The ${c.N} can be reached and used without a mouse, a visible outline shows where you are, and you can move away from it.`
    },

    // ---------- Links ----------
    'Verify disabled link does not navigate': {
      t: c => `Check that the disabled ${c.N} does nothing`, s: c => [`Click the ${c.N}.`],
      e: () => 'Nothing happens: the page does not change.'
    },
    'Verify script-driven link action': {
      t: c => `Check that the ${c.N} does what it should`, s: c => [`Click the ${c.N} once.`],
      e: () => 'The expected action happens once, with no error message.'
    },
    'Verify email link handoff': {
      t: c => `Check that the ${c.N} opens the email app`, s: c => [`Click the ${c.N}.`],
      e: () => 'The email app opens with the address shown in the link.'
    },
    'Verify telephone link handoff': {
      t: c => `Check that the ${c.N} opens the phone app`, s: c => [`Click the ${c.N}.`],
      e: () => 'The phone app (or calling app) opens with the number shown in the link.'
    },
    'Verify missing external handler behavior': {
      t: c => `Check the ${c.N} on a device without an email or phone app`,
      s: c => [L('Use a computer that has no email or phone app set up.'), `Click the ${c.N}.`],
      e: () => 'The page keeps working normally; nothing breaks.'
    },
    'Verify linked file download': {
      t: c => `Check that the ${c.N} downloads the right file`, s: c => [`Click the ${c.N}.`, L('Open the downloaded file.')],
      e: () => 'The file downloads, opens without errors, and contains the expected content.'
    },
    'Verify unavailable download and retry': {
      t: c => `Check what happens when the file behind the ${c.N} is not available`,
      s: c => [L('Ask the team to make the file unavailable, or use a user who has no access to it.'), `Click the ${c.N}.`, L('Try again.')],
      e: () => 'A clear error message appears; no empty or broken file is saved.'
    },
    'Verify in-page anchor destination': {
      t: c => `Check that the ${c.N} jumps to the right section`, s: c => [`Click the ${c.N}.`],
      e: () => 'The page scrolls to the matching section on the same page.'
    },
    'Verify link destination and page identity': {
      t: c => `Check that the ${c.N} opens the right page`, s: c => [`Click the ${c.N}.`, L('Look at the page that opens.')],
      e: () => 'The correct page opens and matches what the link says.'
    },
    'Verify link is not broken': {
      t: c => `Check that the ${c.N} is not broken`, s: c => [`Click the ${c.N}.`],
      e: () => 'The page opens normally, with no "Page not found" or server error.'
    },
    'Verify browser Back and Forward after navigation': {
      t: c => `Check the browser Back and Forward buttons after using the ${c.N}`,
      s: c => [`Click the ${c.N}.`, L('Press the browser Back button.'), L('Press the browser Forward button.')],
      e: () => 'Back returns to this page and Forward returns to the linked page, with no errors and no form sent again.'
    },
    'Verify external destination trust and handoff': {
      t: c => `Check that the ${c.N} goes to a trusted outside website`,
      s: c => [`Click the ${c.N}.`, L('Look at the address bar of the page that opens.')],
      e: () => 'The website is an approved one, and the address does not contain personal or account details.'
    },
    'Verify special-protocol link behavior': {
      t: c => `Check that the ${c.N} opens the right app`, s: c => [`Click the ${c.N}.`],
      e: () => 'The correct app opens, or a clear message says it is not supported.'
    },
    'Verify new-tab link behavior': {
      t: c => `Check that the ${c.N} opens in a new tab`, s: c => [`Click the ${c.N}.`],
      e: () => 'The linked page opens in a new tab, and this page stays open in the original tab.'
    },
    'Verify new-tab opener isolation': {
      t: c => `Check that the page opened by the ${c.N} cannot change this page`,
      s: c => [`Click the ${c.N}.`, L('Switch back to the original tab.')],
      e: () => 'The original page is unchanged and has not been sent to another website.'
    },
    'Verify declared browsing-context target': {
      t: c => `Check where the ${c.N} opens`, s: c => [`Click the ${c.N}.`],
      e: () => 'The link opens in the same tab (or where the design says), and nothing unexpected opens.'
    },

    // ---------- Buttons ----------
    'Verify disabled button cannot execute an action': {
      t: c => `Check that the disabled ${c.N} cannot be used`,
      s: c => [`Click the ${c.N}.`, `Press Tab to reach the ${c.N} and press Enter.`],
      e: () => 'Nothing happens until the required steps are done and the button becomes active.'
    },
    'Verify button performs its intended action': {
      t: c => `Check that the ${c.N} does its job`,
      s: c => [L('Fill in the page with valid test data, if needed.'), `Click the ${c.N} once.`],
      e: () => 'The expected action happens once (for example, the data is saved) and the page shows the right result.',
      d: () => 'Valid test data agreed with the team'
    },
    'Verify rapid repeated activation': {
      t: c => `Check that clicking the ${c.N} many times quickly does not repeat the action`,
      s: c => [L('Fill in the page with valid test data, if needed.'), `Double-click the ${c.N}, then click it several times quickly.`, L('Check the saved data or the list of records.')],
      e: () => 'The action happens only once: no duplicate records, payments or messages.',
      d: () => 'Double-click and fast repeated clicks'
    },
    'Verify repeatable row creation and independent values': {
      t: c => `Check that the ${c.N} adds a new row that works on its own`,
      s: c => [`Click the ${c.N} twice to add two rows.`, L('Type different values in each row.'), L('Change or remove one of the rows.')],
      e: () => 'Each row keeps its own values; changing or removing one row does not change another.',
      d: () => 'Two rows with different values'
    },
    'Verify reset scope and resulting values': {
      t: c => `Check that the ${c.N} clears only this form`, s: c => [L('Fill in a few fields.'), `Click the ${c.N}.`],
      e: () => 'This form goes back to its starting values; other parts of the page are not changed.'
    },
    'Verify cancel or close behavior': {
      t: c => `Check that the ${c.N} closes without saving`, s: c => [L('Change a few fields.'), `Click the ${c.N}.`],
      e: () => 'The screen closes or goes back, and the changes are not saved (or you are asked to confirm, if the design says so).'
    },
    'Verify expand/collapse state and controlled content': {
      t: c => `Check that the ${c.N} opens and closes its section`, s: c => [`Click the ${c.N}.`, `Click the ${c.N} again.`],
      e: () => 'The section opens on the first click and closes on the second; other sections stay as they were.'
    },

    // ---------- Fields: general ----------
    'Verify disabled control cannot be edited': {
      t: c => `Check that the disabled ${c.N} cannot be changed`, s: c => [`Try to click and type in the ${c.N}.`],
      e: c => `The ${c.N} cannot be changed while it is disabled.`
    },
    'Verify prerequisites enable the dependent control': {
      t: c => `Check that the ${c.N} becomes available after the earlier step`,
      s: c => [`Fill in the field that the ${c.N} depends on (usually the one above it).`, `Look at the ${c.N}.`],
      e: c => `The ${c.N} becomes available only after the earlier field is filled, and shows values that match it.`,
      n: () => 'The page shows this field as disabled. Confirm which earlier field unlocks it.'
    },
    'Verify read-only value cannot be edited': {
      t: c => `Check that the read-only ${c.N} cannot be changed`, s: c => [`Click the ${c.N} and try to type or paste.`],
      e: () => 'The value does not change; it can still be selected and copied.'
    },
    'Verify valid field input': {
      t: c => `Check that the ${c.N} accepts a correct value`,
      s: c => [`Type a correct value in the ${c.N}, for example: ${c.example}.`, L('Move to the next field.')],
      e: () => 'The value is accepted, with no error message.',
      d: c => c.example
    },
    'Verify mandatory field left empty': {
      t: c => `Check that the ${c.N} cannot be left empty`,
      s: c => [fillOthers, `Leave the ${c.N} empty.`, `Click ${c.submit}.`],
      e: c => `The form is not sent, and a clear message next to the ${c.N} says it is required.`,
      d: () => 'Leave the field empty'
    },
    'Verify optional field left empty': {
      t: c => `Check that the ${c.N} can be left empty`,
      s: c => [fillOthers, `Leave the ${c.N} empty.`, `Click ${c.submit}.`],
      e: c => `The form is sent successfully without the ${c.N}.`,
      d: () => 'Leave the field empty',
      n: () => 'The page does not mark this field as required. Confirm with the requirement that it is optional.'
    },
    'Verify copy, paste, editing and clearing': {
      t: c => `Check typing, editing, pasting and clearing in the ${c.N}`,
      s: c => [`Type a value in the ${c.N}.`, L('Change part of it.'), L('Paste a value copied from somewhere else.'), L('Delete all the text.')],
      e: c => `Each action works normally, and only the ${c.N} changes.`
    },
    'Verify whitespace and special-character handling': {
      t: c => `Check spaces and special characters in the ${c.N}`,
      s: c => [`Type a value with spaces before and after it in the ${c.N}.`, L('Type only spaces.'), L('Type special characters such as \' " & < > and non-English letters (for example Hindi).'), `Click ${c.submit}.`],
      e: () => 'Extra spaces are removed or refused as designed; special characters are saved and shown correctly, without errors.',
      d: () => '"  Priya  ", "     " (only spaces), O\'Brien & Co <test>, प्रिया'
    },
    'Verify minimum text length': {
      t: c => `Check the minimum length of the ${c.N} (${c.minLength} characters)`,
      s: c => [`Type ${c.minLength - 1} characters in the ${c.N} and click ${c.submit}.`, `Type exactly ${c.minLength} characters and click ${c.submit}.`, `Type ${c.minLength + 1} characters and click ${c.submit}.`],
      e: c => `${c.minLength - 1} characters is refused with a message; ${c.minLength} and ${c.minLength + 1} characters are accepted.`,
      d: c => `${Math.max(0, c.minLength - 1)}, ${c.minLength} and ${c.minLength + 1} characters`
    },
    'Verify maximum text length': {
      t: c => `Check the maximum length of the ${c.N} (${c.maxLength} characters)`,
      s: c => [`Type ${Math.max(0, c.maxLength - 1)} characters in the ${c.N}.`, `Type exactly ${c.maxLength} characters.`, `Try to type or paste ${c.maxLength + 1} characters.`],
      e: c => `Up to ${c.maxLength} characters can be entered; character number ${c.maxLength + 1} is not accepted.`,
      d: c => `${Math.max(0, c.maxLength - 1)}, ${c.maxLength} and ${c.maxLength + 1} characters`
    },
    'Verify declared pattern validation': {
      t: c => `Check that the ${c.N} accepts only the allowed format`,
      s: c => [`Enter a value in the correct format in the ${c.N}.`, L('Enter a value in a wrong format.'), `Click ${c.submit}.`],
      e: () => 'The correct format is accepted; the wrong format shows a clear error message.',
      n: c => `Allowed format (technical rule for the team): ${c.el.pattern}`
    },
    'Verify lower value boundary': {
      t: c => `Check the lowest allowed value of the ${c.N} (${c.min})`,
      s: c => [`Enter ${c.below} in the ${c.N} and click ${c.submit}.`, `Enter ${c.min} and click ${c.submit}.`, `Enter ${c.minAbove} and click ${c.submit}.`],
      e: c => `${c.below} is refused with a clear message; ${c.min} and ${c.minAbove} are accepted.`,
      d: c => `${c.below}, ${c.min}, ${c.minAbove}`
    },
    'Verify upper value boundary': {
      t: c => `Check the highest allowed value of the ${c.N} (${c.max})`,
      s: c => [`Enter ${c.maxBelow} in the ${c.N} and click ${c.submit}.`, `Enter ${c.max} and click ${c.submit}.`, `Enter ${c.above} and click ${c.submit}.`],
      e: c => `${c.maxBelow} and ${c.max} are accepted; ${c.above} is refused with a clear message.`,
      d: c => `${c.maxBelow}, ${c.max}, ${c.above}`
    },
    'Verify declared step interval': {
      t: c => `Check that the ${c.N} accepts only steps of ${c.el.step}`,
      s: c => [`Enter a value that fits steps of ${c.el.step} in the ${c.N}.`, L('Enter a value in between (that does not fit the steps).'), `Click ${c.submit}.`],
      e: c => `Values in steps of ${c.el.step} are accepted; values in between are refused.`
    },
    'Verify malformed numeric or date/time input': {
      t: c => `Check that the ${c.N} refuses an impossible value`,
      s: c => [`Type letters or an impossible value in the ${c.N} (for example "abc" for a number, or 31-02-2026 for a date).`, `Click ${c.submit}.`],
      e: () => 'The value is refused with a clear message.',
      d: () => '"abc", 31-02-2026, 25:61'
    },
    'Verify invalid email format': {
      t: c => `Check that the ${c.N} refuses a wrong email address`,
      s: c => [`Enter each wrong email address in the ${c.N}.`, `Click ${c.submit} after each one.`],
      e: () => 'Each wrong email address shows a clear error message, and the form is not sent.',
      d: () => 'priya.example.com (no @), priya@ (no domain), priya @example.com (space)'
    },
    'Verify invalid tel format': {
      t: c => `Check that the ${c.N} refuses an invalid phone number`,
      s: c => [`Enter each invalid number in the ${c.N}.`, `Click ${c.submit} after each one.`],
      e: () => 'Each invalid number shows a clear error message, and the form is not sent.',
      d: () => '12345 (too short), 987654321012 (too long), abcdefghij (letters)',
      n: () => 'Confirm the exact phone number rule (length, country code) with the requirement.'
    },
    'Verify invalid url format': {
      t: c => `Check that the ${c.N} refuses a wrong website address`,
      s: c => [`Enter each wrong address in the ${c.N}.`, `Click ${c.submit} after each one.`],
      e: () => 'Each wrong address shows a clear error message.',
      d: () => 'example (no https://), htp:/example.com, javascript:alert(1)'
    },
    'Verify invalid password format': {
      t: c => `Check that the ${c.N} refuses a weak password`,
      s: c => [`Enter each weak password in the ${c.N}.`, `Click ${c.submit} after each one.`],
      e: () => 'A clear message explains the password rules, and weak passwords are not accepted.',
      d: () => 'abc, 12345678, password'
    },
    'Verify credential masking and non-disclosure': {
      t: c => `Check that the password in the ${c.N} is hidden`,
      s: c => [`Type a test password in the ${c.N}.`, L('Look at the screen and the address bar.')],
      e: () => 'The password shows as dots (●●●●) and never appears in the address bar, messages or reports.',
      d: () => 'Test password, for example Test@1234'
    },
    'Verify password policy and confirmation mismatch': {
      t: c => `Check the password rules and "Confirm password" for the ${c.N}`,
      s: c => [L('Enter a password that breaks the rules (too short, no number).'), L('Enter a valid password, then a different one in "Confirm password".'), `Click ${c.submit}.`],
      e: () => 'A message explains the password rules; different passwords show a "Passwords do not match" message.',
      d: () => 'abc; Test@1234 and Test@12345'
    },
    'Verify choosing a suggested option': {
      t: c => `Check that the ${c.N} suggests values while typing`,
      s: c => [`Type the first letters of a value in the ${c.N}.`, L('Choose one of the suggestions.')],
      e: c => `Suggestions appear (${c.suggestions} in total), and the chosen one fills the box exactly.`
    },
    'Verify a value that is not in the suggestion list': {
      t: c => `Check the ${c.N} with a value that is not in its suggestions`,
      s: c => [`Type a value in the ${c.N} that is not suggested.`, `Click ${c.submit}.`],
      e: () => 'Either the value is accepted, or a clear message asks you to choose from the list (as the requirement says).',
      d: () => 'A value that is not in the list'
    },
    'Verify matching and no-result search/filter states': {
      t: c => `Check searching with the ${c.N}`,
      s: c => [L('Search for something that exists.'), L('Search for part of it, and with different capital letters.'), L('Search for something that does not exist.'), L('Clear the search.')],
      e: () => 'Matching results appear; a "No results" message shows when nothing matches; clearing the search shows everything again.'
    },
    'Verify verification-code validity, expiry and reuse': {
      t: c => `Check that the ${c.N} accepts only a valid, current code`,
      s: () => [L('Request a code.'), L('Enter a wrong code.'), L('Enter an old (expired) code.'), L('Enter the correct new code.'), L('Try to use the same code again.')],
      e: () => 'Only the correct, unexpired code works, and only once.',
      d: () => 'Codes from the test SMS/email service',
      n: () => 'Use the test code service; never use a real customer\'s code.'
    },
    'Verify verification-code length, paste and resend rules': {
      t: c => `Check typing, pasting and resending the code in the ${c.N}`,
      s: () => [L('Type the code digit by digit.'), L('Paste the full code in one go.'), L('Click "Resend code" and enter the new code.'), L('Enter a wrong code several times.')],
      e: () => 'Typing and pasting both work; after a resend only the new code works; too many wrong tries are blocked as designed.'
    },
    'Verify rich-text formatting and paste behavior': {
      t: c => `Check formatting in the ${c.N}`,
      s: c => [`Type text in the ${c.N} and make some of it bold, a list and a link.`, L('Paste text copied from Word.'), L('Save, then open the record again.')],
      e: () => 'The formatting is kept and looks the same after saving.'
    },
    'Verify color picker selection and retained value': {
      t: c => `Check that a colour can be chosen in the ${c.N}`,
      s: c => [`Choose a colour in the ${c.N}.`, L('Save, then open the record again.')],
      e: () => 'The chosen colour is shown and is still selected after saving.'
    },

    // ---------- Choices ----------
    'Verify radio-group mutual exclusion': {
      t: c => `Check that only one option can be chosen in ${c.N}`,
      s: c => [`Choose one option in ${c.N}.`, L('Choose a different option.')],
      e: () => 'Only the last chosen option stays selected.'
    },
    'Verify custom radio selection and group state': {
      t: c => `Check that only one option can be chosen in ${c.N}`,
      s: c => [`Choose one option in ${c.N}.`, L('Choose a different option.'), L('Use the arrow keys to move between options.')],
      e: () => 'Only one option is selected at a time, with the mouse and with the keyboard.'
    },
    'Verify required radio group with no selection': {
      t: c => `Check that ${c.N} must be answered`,
      s: c => [fillOthers, `Do not choose any option in ${c.N}.`, `Click ${c.submit}.`],
      e: c => `The form is not sent, and a message asks you to choose an option in ${c.N}.`,
      d: () => 'No option chosen'
    },
    'Verify each radio choice and dependent content': {
      t: c => `Check each option in ${c.N}`,
      s: c => [`Choose each option in ${c.N}, one by one.`, L('After each choice, look at any fields that appear or change.')],
      e: () => 'Each option shows the right extra fields (if any), and nothing from the previous choice is left behind.'
    },
    'Verify checked and unchecked states': {
      t: c => `Check that the ${c.N} can be ticked and unticked`,
      s: c => [`Click the ${c.N} to tick it.`, L('Click it again to untick it.'), L('Press Tab to reach it and press Space.')],
      e: c => `The ${c.N} ticks and unticks each time, with the mouse and with the keyboard.`
    },
    'Verify custom toggle state': {
      t: c => `Check that the ${c.N} switches on and off`,
      s: c => [`Click the ${c.N}.`, L('Click it again.'), L('Press Tab to reach it and press Space.')],
      e: () => 'It switches on and off each time, and the screen shows its current state.'
    },
    'Verify required checkbox remains unchecked': {
      t: c => `Check that the ${c.N} must be ticked`,
      s: c => [fillOthers, `Leave the ${c.N} unticked.`, `Click ${c.submit}.`],
      e: c => `The form is not sent, and a message asks you to tick the ${c.N}.`,
      d: () => 'Not ticked'
    },
    'Verify checkbox-dependent behavior and persistence': {
      t: c => `Check that the ${c.N} is remembered after saving`,
      s: c => [`Tick the ${c.N}.`, L('Save the form.'), L('Open the saved record again.')],
      e: c => `The ${c.N} is still ticked, and any fields linked to it show correctly.`
    },
    'Verify available dropdown choices can be selected': {
      t: c => `Check that every option in the ${c.N} can be chosen`,
      s: c => [`Open the ${c.N}.`, L('Choose each option, one by one.')],
      e: () => 'Each option can be chosen and stays shown as the current choice.',
      d: c => c.choices || 'Every option in the list'
    },
    'Verify disabled or unavailable dropdown options': {
      t: c => `Check that unavailable options in the ${c.N} cannot be chosen`,
      s: c => [`Open the ${c.N}.`, L('Try to choose a greyed-out option.')],
      e: () => 'Greyed-out options cannot be chosen.'
    },
    'Verify required dropdown with no real selection': {
      t: c => `Check that the ${c.N} must have a choice`,
      s: c => [fillOthers, `Leave the ${c.N} on its first "Select…" option.`, `Click ${c.submit}.`],
      e: c => `The form is not sent, and a message asks you to choose a value in the ${c.N}.`,
      d: () => 'No option chosen'
    },
    'Verify dependent dropdown refresh and stale values': {
      t: c => `Check that the ${c.N} updates when an earlier choice changes`,
      s: c => [`Choose a value in the field above the ${c.N} (for example State).`, `Choose a value in the ${c.N}.`, L('Change the earlier choice.')],
      e: c => `The ${c.N} shows options that match the new choice, and the old value is cleared.`,
      n: c => `Only applies if the ${c.N} depends on another field; otherwise mark it N/A.`
    },
    'Verify delayed or failed option loading and retry': {
      t: c => `Check the ${c.N} when its options load slowly or fail`,
      s: c => [L('Use a slow connection (browser DevTools → Network → Slow 3G), or ask the team to make the options fail.'), `Open the ${c.N}.`],
      e: () => 'A loading message shows while waiting; if loading fails, a clear message and a way to try again appear.',
      n: () => 'Only applies if the options are loaded from the server; otherwise mark it N/A.'
    },
    'Verify multiple dropdown selection and deselection': {
      t: c => `Check that several options can be chosen in the ${c.N}`,
      s: c => [`Choose two or more options in the ${c.N} (hold Ctrl, or Cmd on a Mac).`, L('Remove one of them.'), L('Save the form.')],
      e: () => 'Exactly the chosen options are kept and saved.'
    },
    'Verify widget range, increments and keyboard changes': {
      t: c => `Check the range of the ${c.N}`,
      s: c => [`Move the ${c.N} to its lowest and highest values.`, L('Use the arrow keys to change it.')],
      e: c => `The value stays between ${c.el.getAttribute('aria-valuemin') || 'the minimum'} and ${c.el.getAttribute('aria-valuemax') || 'the maximum'}, and the number shown updates.`
    },

    // ---------- Files ----------
    'Verify supported file attachment': {
      t: c => `Check that a valid file can be uploaded in the ${c.N}`,
      s: c => [`Click the ${c.N}.`, `Choose a valid file (${c.accept}).`],
      e: () => 'The file is attached, its name is shown, and it uploads successfully.',
      d: c => `A valid file (${c.accept})`
    },
    'Verify disallowed file extension or MIME': {
      t: c => `Check that the ${c.N} refuses the wrong type of file`,
      s: c => [`Click the ${c.N}.`, L('Choose a file of a type that is not allowed (for example .exe or .txt).')],
      e: c => `The file is refused, and a clear message says which file types are allowed (${c.accept}).`,
      d: c => `A file that is not ${c.accept}`
    },
    'Verify file-size boundaries': {
      t: c => `Check the file size limit of the ${c.N}`,
      s: () => [L('Upload a file just under the size limit.'), L('Upload a file exactly at the size limit.'), L('Upload a file just over the size limit.')],
      e: () => 'Files up to the limit are accepted; the larger file is refused with a clear message.',
      d: c => `Files just under, at and over the limit${c.sizeLimit ? ` (${c.sizeLimit})` : ''}`,
      n: c => (c.sizeLimit ? '' : 'The page does not show a size limit. Ask the team for it.')
    },
    'Verify empty, corrupt and renamed files': {
      t: c => `Check that the ${c.N} refuses empty or damaged files`,
      s: () => [L('Upload an empty file (0 KB).'), L('Upload a damaged file.'), L('Upload a file renamed to look like an allowed type (for example a .txt renamed to .pdf).')],
      e: () => 'Each bad file is refused with a clear message.'
    },
    'Verify single versus multiple attachment behavior': {
      t: c => (c.el.multiple ? `Check that several files can be uploaded in the ${c.N}` : `Check that a new file in the ${c.N} replaces the old one`),
      s: c => (c.el.multiple ? [L('Choose two valid files at once.')] : [L('Upload a valid file.'), L('Upload a different valid file in the same place.')]),
      e: c => (c.el.multiple ? 'Both files are attached and listed.' : 'Only the second file is kept; the first one is replaced, not added.')
    },
    'Verify missing required attachment': {
      t: c => `Check that the ${c.N} must have a file`,
      s: c => [fillOthers, `Do not upload a file in the ${c.N}.`, `Click ${c.submit}.`],
      e: () => 'The form is not sent, and a message asks you to upload the file.',
      d: () => 'No file'
    },
    'Verify interrupted upload and retry': {
      t: c => `Check what happens when an upload in the ${c.N} is interrupted`,
      s: () => [L('Start uploading a large file.'), L('Turn off the internet during the upload, then turn it back on.'), L('Upload the file again.')],
      e: () => 'An error message appears; after trying again, the file is uploaded once (not twice).'
    },

    // ---------- Other parts of the page ----------
    'Verify menu-item action and menu dismissal': {
      t: c => `Check that the menu option ${c.N} works`, s: c => [L('Open the menu.'), `Click ${c.N}.`],
      e: () => 'The action happens once, and the menu closes.'
    },
    'Verify signature drawing, clear and saved result': {
      t: c => `Check drawing, clearing and saving a signature in the ${c.N}`,
      s: c => [`Draw a test signature in the ${c.N}.`, L('Click Clear and draw it again.'), L('Save, then open the record again.')],
      e: () => 'The signature can be drawn, cleared and saved, and the saved signature is shown correctly.'
    },
    'Verify hierarchical selection and expand/collapse': {
      t: c => `Check opening, closing and selecting items in the ${c.N}`,
      s: () => [L('Open and close a parent item.'), L('Select a parent item, then a child item.')],
      e: () => 'Items open and close correctly, and the selection is kept as designed.'
    },
    'Verify progress state and completion feedback': {
      t: c => `Check that the ${c.N} shows progress correctly`, s: () => [L('Start the task that shows progress.')],
      e: () => 'The bar moves while the task runs and shows "complete" (or an error) at the end.'
    },
    'Verify tab and associated panel': {
      t: c => `Check that the ${c.N} shows its own content`, s: c => [`Click the ${c.N}.`],
      e: () => 'The content for this tab is shown, and the content of other tabs is hidden.'
    },
    'Verify disclosure opens and closes': {
      t: c => `Check that the ${c.N} opens and closes`, s: c => [`Click the ${c.N}.`, L('Click it again.')],
      e: () => 'The section opens on the first click and closes on the second; its contents can be used when open.'
    },
    'Verify image rendering and text alternative': {
      t: c => `Check that the ${c.N} loads and has a description`,
      s: c => [`Look at the ${c.N}.`, L('Move to it with a screen reader.')],
      e: () => 'The image shows (no broken-image icon). If it carries meaning, a short description is read out.'
    },
    'Verify table/grid headers and cell relationships': {
      t: c => `Check that the ${c.N} shows data in the right columns`, s: c => [`Look at the ${c.N}.`],
      e: () => 'Each column has a clear heading, and values line up under the right heading.'
    },
    'Verify available sorting, filtering and pagination': {
      t: c => `Check sorting, filtering and paging in the ${c.N}`,
      s: () => [L('Sort by a column, both ways.'), L('Filter the list, including a filter with no results.'), L('Go to the first and the last page.')],
      e: () => 'The correct rows are shown each time, with nothing missing or repeated.',
      n: () => 'Mark N/A for anything the table does not offer.'
    },
    'Verify dialog focus and dismissal': {
      t: c => `Check that the ${c.N} opens and closes properly`,
      s: () => [L('Open the pop-up.'), L('Press Tab several times.'), L('Close it with the close button, then open it again and close it with the Esc key.')],
      e: () => 'While it is open the keyboard stays inside the pop-up; after closing you are back where you started.'
    },
    'Verify valid form submission and saved data': {
      t: c => `Check that the ${c.N} can be submitted with correct data`,
      s: c => [L('Fill in every field with valid test data.'), `Click ${c.submit}.`, L('Open the saved record again, if possible.')],
      e: () => 'A success message appears once, and the saved details match what was entered.',
      d: () => 'A complete set of valid test data'
    },
    'Verify form with invalid or missing required input': {
      t: c => `Check that the ${c.N} shows errors for missing or wrong data`,
      s: c => [L('Leave the required fields empty, and enter a wrong format in one field.'), `Click ${c.submit}.`],
      e: () => 'The form is not sent, and each problem field shows its own clear error message.',
      d: () => 'Required fields empty; one field with a wrong format'
    },
    'Verify failed submission and safe retry': {
      t: c => `Check what happens when the ${c.N} cannot be sent`,
      s: c => [L('Fill in every field with valid test data.'), L('Turn off the internet (or ask the team to make the server fail).'), `Click ${c.submit}.`, L('Turn the internet back on and submit again.')],
      e: () => 'A clear error message appears; after trying again, the data is saved once (not twice).'
    },

    // ---------- Whole page ----------
    'Verify page loads and key controls are available': {
      t: c => `Check that the ${c.P} opens and works`, s: () => [],
      e: () => 'The page opens with the right title and content, and its main buttons and fields can be used.'
    },
    'Verify responsive layout and readable content': {
      t: c => `Check the ${c.P} on mobile, tablet and desktop`,
      s: () => [L('Open the page again on a phone and a tablet (or use the browser\'s device mode).')],
      e: () => 'Text is readable, nothing overlaps, and every button can be reached on each screen size.'
    },
    'Verify page keyboard order, headings and error announcements': {
      t: c => `Check the ${c.P} with the keyboard and a screen reader`,
      s: c => [L('Press Tab through the whole page.'), `Click ${c.submit} with an empty required field, with a screen reader turned on.`],
      e: () => 'Tab moves in a sensible order, headings make sense, and error messages are read out.'
    },
    'Verify session expiry during editing': {
      t: c => `Check what happens when the login session expires on the ${c.P}`,
      s: c => [L('Start filling in the form.'), L('Wait until the session times out (ask the team how long that is).'), `Click ${c.submit}.`],
      e: () => 'You are asked to log in again, nothing is saved without a login, and unsaved data is handled as designed.'
    },
    'Verify logout and browser Back behavior': {
      t: c => `Check that the ${c.P} is not available after logout`,
      s: () => [L('Log out.'), L('Press the browser Back button, then refresh.')],
      e: () => 'You are asked to log in again, and no private data is shown.'
    },
    'Verify concurrent-session policy': {
      t: c => `Check the ${c.P} when the same user is logged in on two browsers`,
      s: () => [L('Log in with the same user in a second browser.'), L('Use the page in both browsers.')],
      e: () => 'It behaves as designed (both allowed, or the older login is signed out).'
    },
    'Verify role-based visibility and direct access': {
      t: c => `Check that each user role sees only what it is allowed to on the ${c.P}`,
      s: () => [L('Open the page as each role (for example admin and normal user).'), L('As a role that should not have access, type the page address directly.')],
      e: () => 'Each role sees and can do only what it is allowed to; typing the address directly does not get around this.',
      d: () => 'One test user per role'
    },
    'Verify untrusted input is rendered safely': {
      t: c => `Check that the ${c.P} is safe against harmful text`,
      s: () => [L('Enter <b>test</b> and <script>alert(1)</script> in the text fields.'), L('Save, then open the record again.')],
      e: () => 'The text is shown as plain text; no pop-up appears and the page does not change.',
      d: () => '<b>test</b>, <script>alert(1)</script>'
    },
    'Verify protected state-changing request authorization': {
      t: c => `Check that actions on the ${c.P} cannot be done without permission`,
      s: () => [L('Ask the security team to run this check (for example with OWASP ZAP) in the test environment.')],
      e: () => 'Saving, deleting and similar actions are refused unless the user is logged in and allowed to do them.'
    },
    'Verify dependent service success, failure and recovery': {
      t: c => `Check the ${c.P} when a connected service is slow, empty or failing`,
      s: () => [L('Ask the team to make the service slow, return no data, and fail.'), L('Use the page in each case.')],
      e: () => 'Each case shows a clear message (loading, no data, error), and the page recovers when the service is back.'
    },
    'Verify request, response and persisted record consistency': {
      t: c => `Check that the data saved from the ${c.P} is correct in the system`,
      s: c => [L('Fill in every field with valid test data.'), `Click ${c.submit}.`, L('Check the saved record in the system (admin screen or database).')],
      e: () => 'The saved data matches exactly what was entered.'
    },
    'Verify duplicate record and concurrent update handling': {
      t: c => `Check the ${c.P} with duplicate data and two people editing at once`,
      s: () => [L('Submit the same record twice.'), L('Open the same record in two browsers, change it in both and save.')],
      e: () => 'Duplicates are blocked with a message; changes from two people are handled without silently losing data.'
    },
    'Verify audit/history for supported changes': {
      t: c => `Check that changes made on the ${c.P} are recorded in the history`,
      s: () => [L('Create, change and delete a test record.'), L('Open the history or audit screen.')],
      e: () => 'Each change shows who made it, when, and what changed.',
      n: () => 'Mark N/A if the system has no history screen.'
    },
    'Verify offline, slow-network and recovery states': {
      t: c => `Check the ${c.P} with a slow or lost internet connection`,
      s: c => [L('Switch to a slow connection (browser DevTools → Network → Slow 3G).'), `Click ${c.submit}.`, L('Turn the internet off and back on during the submission.')],
      e: () => 'A "please wait" or error message appears, there is no false "saved" message, and the data is saved once after reconnecting.'
    },
    'Verify supported browsers and repeated workflow execution': {
      t: c => `Check the ${c.P} in all supported browsers`,
      s: () => [L('Open the page in Chrome, Edge, Firefox and Safari (whichever are supported).'), L('Complete the main task in each.')],
      e: () => 'The page looks and works the same in every supported browser.'
    },
    'Verify complete documented user journey': {
      t: c => `Check the complete journey through the ${c.P}`,
      s: c => [L('Fill in every field with valid test data.'), `Click ${c.submit} and follow any next steps until the confirmation.`, L('Open the saved record.')],
      e: () => 'The whole journey finishes with a confirmation, and the saved data is correct.'
    },
    'Verify initial page load performance': {
      t: c => `Check how fast the ${c.P} loads`,
      s: () => [L('Clear the browser cache.'), L('Open the page and time how long until it can be used.')],
      e: () => 'The page can be used within the agreed time.',
      d: () => 'Agreed target time (for example under 3 seconds)'
    },
    'Verify retry does not duplicate records or requests': {
      t: c => `Check that trying again after an error on the ${c.P} does not create duplicates`,
      s: c => [L('Turn off the internet.'), `Click ${c.submit}.`, L('Turn the internet back on and try again.'), L('Check the saved records.')],
      e: () => 'Only one record is saved.'
    },
    'Verify refresh preserves or safely resets state': {
      t: c => `Check what happens when the ${c.P} is refreshed`,
      s: () => [L('Fill in some fields.'), L('Press F5 to refresh the page.')],
      e: () => 'The entered data is kept or cleared as designed, and no wrong or old values are shown.'
    },
    'Verify zoom and high-DPI rendering': {
      t: c => `Check the ${c.P} at different zoom levels`,
      s: () => [L('Set the browser zoom to 80%, 100%, 125% and 200% (Ctrl + and Ctrl −).')],
      e: () => 'Text and buttons stay readable and usable; nothing is cut off.',
      d: () => '80%, 100%, 125%, 200%'
    },
    'Verify reduced-motion and high-contrast behavior': {
      t: c => `Check the ${c.P} with accessibility settings turned on`,
      s: () => [L('Turn on "reduce motion" and high contrast in the computer\'s settings.'), L('Use the page.')],
      e: () => 'The page is still clear and easy to use.'
    },
    'Verify browser back/forward does not duplicate actions': {
      t: c => `Check that the browser Back and Forward buttons on the ${c.P} do not repeat actions`,
      s: c => [`Fill in the form and click ${c.submit}.`, L('Press Back, then Forward.')],
      e: () => 'The form is not sent again, and no action is repeated.'
    }
  };

  // Page-level checks that test the extension itself, not the client's website: never generated.
  const NOT_FOR_CLIENT = new Set([
    'Verify repeated scan does not degrade the page',
    'Verify sensitive values are not exposed in downloads',
    'Verify maximum supported DOM size',
    'Verify extension reload recovery'
  ]);

  root.SFFATestCaseWording = { W, NOT_FOR_CLIENT };
})(window);
