// Popup shared state and constants. Loaded first; see popup.html for script order.

const FILE_TYPE_OPTIONS = (window.SFFAFileTypes && window.SFFAFileTypes.FILE_TYPE_DEFINITIONS) || [
  { type: 'photo', label: 'Photo', tag: 'IMG' },
  { type: 'identityDocument', label: 'Identity Document', tag: 'ID' },
  { type: 'addressProof', label: 'Address Proof', tag: 'ADDR' },
  { type: 'signature', label: 'Signature', tag: 'SIGN' },
  { type: 'authorizationLetter', label: 'Authorization Letter', tag: 'AUTH' },
  { type: 'evidenceDocument', label: 'Evidence Document', tag: 'EVID' },
  { type: 'genericFile', label: 'Other Document', tag: 'FILE' }
];


const SUMMARY_STORAGE_KEY = 'sffa_popup_summary_by_tab';
const summary = {
  fields: null, passed: null, failed: null, skipped: null, issues: null, score: null,
  accessibility: null, console: null, network: null, durationMs: null, hasRun: false
};
let activeSummaryTab = null;
let activeSummaryKey = null;
let summaryTabRefreshQueue = Promise.resolve();
let viewportZoom = 1;
let aiApprovedOrigins = new Set(['https://api.openai.com']);
let selectedTargetTab = null;
let availableTargetTabs = [];

/** Reports whether this popup is running with the extension API available. */
const hasExt = () => !!window.SFFAExt?.hasExt;
