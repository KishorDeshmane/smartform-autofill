(function (root) {
  const UPLOAD_STATUS = Object.freeze({
    FILE_SELECTED: 'FILE_SELECTED',
    UPLOAD_ATTEMPTED: 'UPLOAD_ATTEMPTED',
    UPLOAD_SUCCESS: 'UPLOAD_SUCCESS',
    UPLOAD_PARTIAL: 'UPLOAD_PARTIAL',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    CONTENT_UNAVAILABLE: 'CONTENT_UNAVAILABLE',
    REJECTED_BY_ACCEPT: 'REJECTED_BY_ACCEPT',
    MANUAL_SELECTION_REQUIRED: 'MANUAL_SELECTION_REQUIRED',
    SKIPPED_NOT_MAPPED: 'SKIPPED_NOT_MAPPED',
    SKIPPED_STALE_FIELD: 'SKIPPED_STALE_FIELD'
  });

  /** Maps an upload result to its display status, including rejected file types. */
  function classifyUploadResult(result) {
    if (!result) return UPLOAD_STATUS.UPLOAD_FAILED;
    if (result.stale) return UPLOAD_STATUS.SKIPPED_STALE_FIELD;
    if (result.success) {
      return result.skipped ? UPLOAD_STATUS.UPLOAD_PARTIAL : UPLOAD_STATUS.UPLOAD_SUCCESS;
    }
    if (result.contentUnavailable && result.contentUnavailable.length) return UPLOAD_STATUS.CONTENT_UNAVAILABLE;
    if (result.rejectedByAccept && result.rejectedByAccept.length && /not accepted by this field/i.test(result.reason || '')) {
      return UPLOAD_STATUS.REJECTED_BY_ACCEPT;
    }
    if (/requires manual selection/i.test(result.reason || '')) return UPLOAD_STATUS.MANUAL_SELECTION_REQUIRED;
    if (/no files provided/i.test(result.reason || '')) return UPLOAD_STATUS.SKIPPED_NOT_MAPPED;
    return UPLOAD_STATUS.UPLOAD_FAILED;
  }

  const UPLOAD_STATUS_LABEL = Object.freeze({
    FILE_SELECTED: 'File selected',
    UPLOAD_ATTEMPTED: 'Upload in progress',
    UPLOAD_SUCCESS: 'Files attached to field; website upload not verified',
    UPLOAD_PARTIAL: 'Files attached with some mapped files skipped; website upload not verified',
    UPLOAD_FAILED: '❌ Upload failed',
    CONTENT_UNAVAILABLE: '❌ File content unavailable',
    REJECTED_BY_ACCEPT: '❌ Rejected — wrong file type for this field',
    MANUAL_SELECTION_REQUIRED: '⚠ Requires manual selection',
    SKIPPED_NOT_MAPPED: '— No file mapped to this field',
    SKIPPED_STALE_FIELD: '⚠ Field changed before upload — retry'
  });

  const FIELD_STATUS = Object.freeze({
    PASSED: 'PASSED',
    UNABLE_TO_VERIFY: 'UNABLE_TO_VERIFY',
    FAILED: 'FAILED'
  });

  const FIELD_STATUS_LABEL = Object.freeze({
    PASSED: '✅ Passed',
    UNABLE_TO_VERIFY: '⚠ Unable to Verify',
    FAILED: '❌ Failed'
  });

  const FIELD_STATUS_TO_LEGACY = Object.freeze({
    PASSED: 'pass',
    UNABLE_TO_VERIFY: 'warn',
    FAILED: 'fail'
  });

  root.SFFAStatus = {
    UPLOAD_STATUS,
    UPLOAD_STATUS_LABEL,
    classifyUploadResult,
    FIELD_STATUS,
    FIELD_STATUS_LABEL,
    FIELD_STATUS_TO_LEGACY
  };
})(typeof window !== 'undefined' ? window : this);
