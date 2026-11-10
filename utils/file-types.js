(function (root) {
  const FILE_TYPE_DEFINITIONS = [
    { type: 'photo', label: 'Photo', tag: 'IMG', mediaKind: 'image',
      keywords: ['photo', 'profile photo', 'applicant photo', 'passport photo', 'candidate image', 'picture', 'profile picture', 'upload photo'] },
    { type: 'logo', label: 'Logo', tag: 'LOGO', mediaKind: 'image',
      keywords: ['logo', 'company logo', 'organization logo'] },
    { type: 'identityDocument', label: 'Identity Document', tag: 'ID', mediaKind: 'any',
      keywords: ['identity document', 'id proof', 'idproof', 'aadhaar', 'aadhar', 'pan card', 'pan'] },
    { type: 'addressProof', label: 'Address Proof', tag: 'ADDR', mediaKind: 'any',
      keywords: ['address proof', 'addressproof', 'proof of address'] },
    { type: 'signature', label: 'Signature', tag: 'SIGN', mediaKind: 'image',
      keywords: ['signature', 'sign'] },
    { type: 'authorizationLetter', label: 'Authorization Letter', tag: 'AUTH', mediaKind: 'any',
      keywords: ['authorization letter', 'authorisation letter', 'auth letter', 'authorization', 'original authority letter', 'authority letter', 'power of attorney', 'letter of authorization', 'letter of authorisation'] },
    { type: 'resume', label: 'Resume / CV', tag: 'CV', mediaKind: 'any',
      keywords: ['resume', 'cv', 'curriculum vitae'] },
    { type: 'coverLetter', label: 'Cover Letter', tag: 'LETTER', mediaKind: 'any',
      keywords: ['cover letter', 'coverletter'] },
    { type: 'bankStatement', label: 'Bank Statement', tag: 'BANK', mediaKind: 'any',
      keywords: ['bank statement', 'bankstatement', 'passbook'] },
    { type: 'utilityBill', label: 'Utility Bill', tag: 'BILL', mediaKind: 'any',
      keywords: ['utility bill', 'electricity bill', 'water bill', 'gas bill'] },
    { type: 'marksheet', label: 'Marksheet', tag: 'MARK', mediaKind: 'any',
      keywords: ['marksheet', 'mark sheet', 'academic transcript', 'transcript'] },
    { type: 'degreeCertificate', label: 'Degree Certificate', tag: 'DEG', mediaKind: 'any',
      keywords: ['degree certificate', 'diploma certificate', 'qualification certificate', 'education certificate'] },
    { type: 'invoice', label: 'Invoice', tag: 'INV', mediaKind: 'any',
      keywords: ['invoice'] },
    { type: 'receipt', label: 'Receipt', tag: 'REC', mediaKind: 'any',
      keywords: ['receipt', 'payment receipt'] },
    { type: 'evidenceDocument', label: 'Evidence Document', tag: 'EVID', mediaKind: 'any',
      keywords: ['upload evidence', 'evidence document', 'supporting evidence', 'supporting document', 'evidence'] },
    { type: 'moaAoa', label: 'MOA & AOA', tag: 'MOA', mediaKind: 'any',
      keywords: ['moa & aoa', 'moa and aoa', 'memorandum of association', 'articles of association', 'moa', 'aoa'] },
    { type: 'financialStatement', label: 'Financial Statement', tag: 'FIN', mediaKind: 'any',
      keywords: ['financial statement', 'financial statements', 'financial statements for last three years', 'audited financial statement', 'balance sheet', 'profit and loss statement'] },
    { type: 'genericFile', label: 'Other Document', tag: 'FILE', mediaKind: 'any', keywords: [] }
  ];

  const FILE_KEYWORDS = {};
  FILE_TYPE_DEFINITIONS.forEach(({ type, keywords }) => {
    FILE_KEYWORDS[type] = keywords;
  });

  const SUPPORTED_UPLOAD_EXTENSIONS = {
    '.jpg': ['image/jpeg', 'image/jpg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.webp': ['image/webp'],
    '.gif': ['image/gif'],
    '.pdf': ['application/pdf'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xls': ['application/vnd.ms-excel'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.csv': ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
    '.txt': ['text/plain']
  };

  const UPLOAD_ACCEPT_ATTRIBUTE = Object.keys(SUPPORTED_UPLOAD_EXTENSIONS).join(',');

  /** Returns the lowercased suffix after the final dot, or an empty string. */
  function getFileExtension(filename) {
    const name = (filename || '').toString().toLowerCase();
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot);
  }

  /** Checks whether a file's name extension or MIME type is in the supported lists. */
  function isSupportedUploadFile(file) {
    const ext = getFileExtension(file && file.name);
    if (SUPPORTED_UPLOAD_EXTENSIONS[ext]) return true;
    const mime = ((file && file.type) || '').toLowerCase();
    if (!mime) return false;
    return Object.values(SUPPORTED_UPLOAD_EXTENSIONS).some(list => list.includes(mime));
  }

  root.SFFAFileTypes = {
    FILE_TYPE_DEFINITIONS,
    FILE_KEYWORDS,
    SUPPORTED_UPLOAD_EXTENSIONS,
    UPLOAD_ACCEPT_ATTRIBUTE,
    getFileExtension,
    isSupportedUploadFile
  };
})(typeof window !== 'undefined' ? window : this);
