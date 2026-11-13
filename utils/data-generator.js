
(function (root) {
  const STATE_DISTRICT_CITY = {
    Maharashtra: {
      Pune: ['Pune', 'Hinjewadi', 'Kothrud'],
      Mumbai: ['Andheri', 'Bandra', 'Dadar'],
      Nagpur: ['Nagpur', 'Kamptee']
    },
    Karnataka: {
      Bengaluru: ['Bengaluru', 'Whitefield', 'Electronic City'],
      Mysuru: ['Mysuru', 'Nanjangud']
    },
    Delhi: {
      'New Delhi': ['Connaught Place', 'Karol Bagh', 'Saket']
    },
    Gujarat: {
      Ahmedabad: ['Ahmedabad', 'Navrangpura'],
      Surat: ['Surat', 'Adajan']
    },
    'Tamil Nadu': {
      Chennai: ['Chennai', 'Tambaram'],
      Coimbatore: ['Coimbatore', 'Peelamedu']
    },
    'West Bengal': {
      Kolkata: ['Kolkata', 'Salt Lake'],
      Howrah: ['Howrah']
    },
    Rajasthan: {
      Jaipur: ['Jaipur', 'Malviya Nagar'],
      Udaipur: ['Udaipur']
    },
    'Uttar Pradesh': {
      Lucknow: ['Lucknow', 'Gomti Nagar'],
      Noida: ['Noida', 'Greater Noida']
    },
    Telangana: {
      Hyderabad: ['Hyderabad', 'Gachibowli', 'Secunderabad']
    },
    Kerala: {
      Kochi: ['Kochi', 'Ernakulam'],
      Thiruvananthapuram: ['Thiruvananthapuram']
    },
    Punjab: {
      Ludhiana: ['Ludhiana'],
      Amritsar: ['Amritsar']
    },
    Haryana: {
      Gurugram: ['Gurugram', 'Sector 29'],
      Faridabad: ['Faridabad']
    },
    'Madhya Pradesh': {
      Bhopal: ['Bhopal'],
      Indore: ['Indore', 'Vijay Nagar']
    },
    Bihar: {
      Patna: ['Patna', 'Boring Road']
    },
    Odisha: {
      Bhubaneswar: ['Bhubaneswar']
    },
    Assam: {
      Guwahati: ['Guwahati']
    },
    'Andhra Pradesh': {
      Visakhapatnam: ['Visakhapatnam'],
      Vijayawada: ['Vijayawada']
    },
    Chhattisgarh: {
      Raipur: ['Raipur']
    },
    Jharkhand: {
      Ranchi: ['Ranchi']
    },
    Uttarakhand: {
      Dehradun: ['Dehradun']
    },
    'Himachal Pradesh': {
      Shimla: ['Shimla']
    },
    Goa: {
      Panaji: ['Panaji', 'Margao']
    },
    Chandigarh: {
      Chandigarh: ['Chandigarh']
    }
  };

  const ORG_PREFIXES = ['NexGen', 'TechNova', 'BluePeak', 'Skyline', 'Prime', 'Zenith', 'Orbit', 'Vertex'];
  const ORG_SUFFIXES = ['Solutions', 'Enterprises', 'Technologies', 'Systems', 'Industries', 'Ventures'];

  const DESIGNATIONS = ['Software Engineer', 'QA Analyst', 'Project Manager', 'Business Analyst', 'Field Officer', 'Site Supervisor'];
  const DEPARTMENTS = ['Engineering', 'Operations', 'Quality Assurance', 'Sales', 'Compliance', 'Human Resources'];
  const OCCUPATIONS = ['Engineer', 'Teacher', 'Consultant', 'Government Employee', 'Self-Employed', 'Student'];
  const QUALIFICATIONS = ["Bachelor's Degree", "Master's Degree", 'Diploma', 'Higher Secondary'];
  const BANK_NAMES = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Punjab National Bank'];
  const BLOOD_GROUPS = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-', 'AB-'];
  const MARITAL_STATUSES = ['Single', 'Married'];
  const COUNTRIES = ['India'];

  const CAPTION_POOL = [
    'Evidence captured during physical site verification.',
    'Supporting document collected for this checklist item.',
    'On-site photograph/document confirming compliance for this criterion.',
    'Evidence attached as proof of the assessed infrastructure item.',
    'Documentation gathered during the due-diligence visit for this item.',
    'Site evidence recorded to substantiate this evaluation point.'
  ];

  const OBSERVATION_POOL = [
    'No discrepancies observed item verified as compliant during the physical visit.',
    'Item inspected on-site and found to be in satisfactory condition.',
    'Verified against the checklist requirement with no issues noted.',
    'Physical inspection confirms conformity with the stated criterion.',
    'Assessment carried out on-site observations recorded as per protocol.',
    'Reviewed during the site visit and found consistent with requirements.'
  ];

  const DESIGN_PROVISION_POOL = [
    'Redundant provisioning has been incorporated in the design to meet this criterion in full.',
    'The design provision addresses this requirement as per the applicable rating manual clause.',
    'Proposed design meets the stated compliance requirement for this sub-criterion.',
    'Measures have been incorporated at the design stage to satisfy this criterion.'
  ];

  const SUPPORTING_REFERENCE_POOL = [
    'Refer to the attached supporting document for details on this criterion.',
    'See uploaded design/layout document for reference.',
    'Supporting evidence attached under the documents section for this item.'
  ];

  const JUSTIFICATION_POOL = [
    'Assigned score reflects full compliance with the rating manual criterion, as verified against the submitted design/plan documentation.',
    'Score based on the proposed measures meeting the applicable clause requirements in full, with no deviations noted.',
    'Full marks awarded as the design provision satisfies every sub-requirement listed under this criterion.',
    'Score reflects the extent to which the submitted plan addresses this criterion supporting references are attached.',
    'Assessment carried out against the rating manual benchmark - the proposed provision meets the required standard.',
    'Justification is submitted documentation demonstrates conformity with this criterion as per the applicable guideline.'
  ];

  const STD_CODES = ['011', '022', '033', '044', '080', '020', '040', '079'];

  /** Combines a randomly selected sample dialing code with eight random digits. */
  function generateLandlineNumber() {
    return `${pick(STD_CODES)}-${randomDigits(8)}`;
  }

  let seededRandom = null;
  let activeSeed = null;

  /** Small, fast deterministic PRNG returning floats in [0, 1). */
  function mulberry32(state) {
    return function next() {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Hashes any seed text to a 32-bit integer (FNV-1a). */
  function hashSeed(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  /** Enables deterministic generation for a non-empty seed; an empty seed restores Math.random. */
  function setSeed(seed) {
    const value = seed === undefined || seed === null ? '' : String(seed).trim();
    if (!value) { seededRandom = null; activeSeed = null; return null; }
    activeSeed = value;
    seededRandom = mulberry32(hashSeed(value));
    return value;
  }

  /** Returns the seed currently driving generation, or null when unseeded. */
  function getSeed() {
    return activeSeed;
  }

  /** Single randomness source for every generator in this file. */
  function rand() {
    return seededRandom ? seededRandom() : Math.random();
  }

  /** Returns a uniformly selected integer between the inclusive bounds. */
  function randInt(min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
  }

  /** Formats a Date using local year, month, and day as YYYY-MM-DD. */
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Formats the local calendar date at the given offset from today. */
  function isoDateOffsetDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return isoDate(d);
  }

  /** Creates a random date of birth for an age range of 18–60 and calculates age. */
  function generateDobAndAge() {
    const targetAge = randInt(18, 60);
    const today = new Date();
    const year = today.getFullYear() - targetAge;
    const month = randInt(1, 12);
    const day = randInt(1, 28);
    const dob = new Date(year, month - 1, day);
    if (dob > today) dob.setFullYear(dob.getFullYear() - 1);
    let age = today.getFullYear() - dob.getFullYear();
    const hasHadBirthdayThisYear = (today.getMonth() > dob.getMonth())
      || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
    if (!hasHadBirthdayThisYear) age--;
    return { dateOfBirth: isoDate(dob), age: String(age) };
  }

  /** Returns one randomly selected item from a non-empty array. */
  function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  /** Builds a string containing the requested number of random decimal digits. */
  function randomDigits(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += randInt(0, 9);
    return s;
  }

  /** Builds a string containing the requested number of uppercase ASCII letters. */
  function randomLetters(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[randInt(0, chars.length - 1)];
    return s;
  }

  /** Selects a first and last name from settings or the built-in sample lists. */
  function generatePersonName(settings) {
    const firstNames = settings?.firstNames?.length ? settings.firstNames
      : ['Rahul', 'Amit', 'Priya', 'Neha', 'Rohit', 'Sneha', 'Akash', 'Pooja', 'Vikas', 'Anjali'];
    const lastNames = settings?.lastNames?.length ? settings.lastNames
      : ['Sharma', 'Patil', 'Deshmukh', 'Singh', 'Kulkarni', 'Joshi', 'Pawar', 'Jadhav'];
    const firstName = pick(firstNames);
    const lastName = pick(lastNames);
    return { firstName, lastName, fullName: `${firstName} ${lastName}` };
  }

  /** Generates a test.com email, checking and recording it in storage when available. */
  async function generateUniqueEmail(firstName, lastName, locale) {
    let email, tries = 0;
    // Seeded runs must be replayable, so they ignore history and the clock.
    const used = !activeSeed && root.SFFAStorage ? await root.SFFAStorage.getUsed('email') : [];
    do {
      const suffix = activeSeed ? `${randInt(1000, 9999)}${randomDigits(3)}` : `${randInt(1000, 9999)}${Date.now().toString().slice(-3)}`;
      const localeTag = locale && locale !== 'IN' ? `.${locale.toLowerCase()}` : '';
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${localeTag}${suffix}@example.com`;
      tries++;
    } while (used.includes(email) && tries < 10);
    if (root.SFFAStorage) await root.SFFAStorage.addUsed('email', email);
    return email;
  }

  /** Generates a 10-digit mobile-like value and records it in storage when available. */
  async function generateUniqueIndianMobile(locale = 'IN') {
    let mobile, tries = 0;
    const used = !activeSeed && root.SFFAStorage ? await root.SFFAStorage.getUsed('mobile') : [];
    do {
      if (locale === 'US') mobile = `${pick(['2','3','4','5','6','7','8','9'])}${randomDigits(9)}`;
      else if (locale === 'UK') mobile = `07${randomDigits(9)}`;
      else mobile = `${pick(['6', '7', '8', '9'])}${randomDigits(9)}`;
      tries++;
    } while (used.includes(mobile) && tries < 15);
    if (root.SFFAStorage) await root.SFFAStorage.addUsed('mobile', mobile);
    return mobile;
  }

  /** Combines built-in organization words with a random code. */
  function generateUniqueOrganizationName() {
    const prefix = pick(ORG_PREFIXES);
    const suffix = pick(ORG_SUFFIXES);
    const code = `${randomLetters(1)}${randInt(1000, 9999)}`;
    return `${prefix} ${suffix} ${code}`;
  }

  /** Replaces {LETTERS} and {DIGITS} tokens in the supplied format or default format. */
  function generateRegistrationNumber(pattern) {
    const fmt = pattern || '{LETTERS}{DIGITS}';
    return fmt
      .replace('{LETTERS}', randomLetters(3))
      .replace('{DIGITS}', String(randInt(1000, 9999)));
  }

  /** Returns a 14-digit sample payment reference. */
  function generatePaymentReference() {
    return randomDigits(14);
  }

  /** Selects a PIN from the supplied non-empty pool or the built-in sample list. */
  function generateTestPinCode(pool) {
    const pins = pool && pool.length ? pool : ['411001', '411007', '411038', '411045', '110001', '560001'];
    return pick(pins);
  }

  /** Returns a PAN-shaped sample string; it is not checked against real records. */
  function generatePanNumber() {
    return `${randomLetters(5)}${randomDigits(4)}${randomLetters(1)}`;
  }

  const VERHOEFF_D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const VERHOEFF_P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  const VERHOEFF_INV = [0,4,3,2,1,5,6,7,8,9];
  /** Adds a Verhoeff check digit to an 11-digit synthetic Aadhaar-shaped value. */
  function generateAadhaar() {
    let body = `${pick(['2','3','4','5','6','7','8','9'])}${randomDigits(10)}`;
    let checksum = 0;
    for (let i = 0; i < body.length; i++) checksum = VERHOEFF_D[checksum][VERHOEFF_P[(i + 1) % 8][Number(body[body.length - 1 - i])]];
    return body + String(VERHOEFF_INV[checksum]);
  }

  const CIN_STATE_CODES = ['DL', 'MH', 'KA', 'TN', 'GJ', 'WB', 'UP', 'RJ'];
  const CIN_CATEGORY_CODES = ['PTC', 'PLC', 'OPC', 'FTC'];

  /** Builds a CIN-shaped sample string from the module's fixed code lists. */
  function generateCIN() {
    const listed = pick(['U', 'L']);
    const year = randInt(1990, new Date().getFullYear());
    return `${listed}${randomDigits(5)}${pick(CIN_STATE_CODES)}${year}${pick(CIN_CATEGORY_CODES)}${randomDigits(6)}`;
  }

  /** Returns an LLPIN-shaped sample value made from letters and digits. */
  function generateLLPIN() {
    return `${randomLetters(3)}-${randomDigits(4)}`;
  }

  /** Generates an identifier shape selected by type, falling back to a generic ID. */
  function generateIdentityNumber(identityType) {
    switch (identityType) {
      case 'PAN':
        return `${randomLetters(5)}${randomDigits(4)}${randomLetters(1)}`;
      case 'CIN':
        return generateCIN();
      case 'LLPIN':
        return generateLLPIN();
      case 'GSTIN':
        return generateGstNumber();
      case 'AADHAAR':
        return generateAadhaar();
      case 'REGISTRATION':
        return `REG${randomDigits(6)}`;
      case 'GENERIC':
      default:
        return `ID${randomDigits(8)}`;
    }
  }

  const IDENTITY_TYPES = ['CIN', 'LLPIN', 'PAN', 'GSTIN', 'AADHAAR'];
  /** Randomly selects one supported identity type from the built-in list. */
  function generateIdentityType() {
    return pick(IDENTITY_TYPES);
  }

  /** Returns a sample EPF-shaped value using fixed letter and digit groups. */
  function generateEpfNumber() {
    return `${randomLetters(2)}${randomDigits(7)}${randomLetters(3)}${randomDigits(7)}`;
  }

  /** Returns a 17-digit sample ESI number. */
  function generateEsiNumber() {
    return randomDigits(17);
  }

  /** Returns a sample IFSC-shaped code with a zero in the fifth position. */
  function generateIfscCode() {
    return `${randomLetters(4)}0${randInt(100000, 999999)}`;
  }

  /** Generates a test credit-card-like number with a valid Luhn check digit. */
  function generateCreditCardNumber() {
    const body = `4${randomDigits(14)}`;
    let sum = 0, doubleDigit = true;
    for (let i = body.length - 1; i >= 0; i--, doubleDigit = !doubleDigit) {
      let digit = Number(body[i]);
      if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
    }
    return body + String((10 - sum % 10) % 10);
  }

  /** Creates a GB-shaped synthetic IBAN whose rearranged digits satisfy mod-97. */
  function generateIban() {
    const bban = `NWBK${randomDigits(14)}`;
    const rearranged = `${bban}GB00`;
    const numeric = [...rearranged].map(ch => /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch).join('');
    let remainder = 0;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    return `GB${String(98 - remainder).padStart(2, '0')}${bban}`;
  }

  /** Returns a random digit string with a length from 11 through 16. */
  function generateBankAccountNumber() {
    return randomDigits(randInt(11, 16));
  }

  /** Returns a 15-character GSTIN-shaped sample: state code + PAN + entity number + Z + check character. */
  function generateGstNumber() {
    const body = `${pick(['10','27','29','33','07'])}${randomLetters(5)}${randomDigits(4)}${randomLetters(1)}1Z`;
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      const product = alphabet.indexOf(body[i]) * (i % 2 ? 2 : 1);
      sum += Math.floor(product / 36) + product % 36;
    }
    const check = (36 - sum % 36) % 36;
    return body + alphabet[check];
  }

  /** Returns a vehicle-registration-shaped sample string. */
  function generateVehicleNumber() {
    return `${randomLetters(2)}${randInt(10, 99)}${randomLetters(2)}${randomDigits(4)}`;
  }

  /** Builds a sample HTTPS URL from the organization name's alphanumeric slug. */
  function generateWebsite(organizationName) {
    const slug = (organizationName || 'example').toLowerCase().replace(/[^a-z0-9]+/g, '');
    return `https://www.${slug || 'example'}.com`;
  }

  /** Selects a state, district, and city from the module's fixed location data. */
  function generateLocation() {
    const states = Object.keys(STATE_DISTRICT_CITY);
    const state = pick(states);
    const districts = Object.keys(STATE_DISTRICT_CITY[state]);
    const district = pick(districts);
    const city = pick(STATE_DISTRICT_CITY[state][district]);
    return { state, district, city };
  }

  /** Builds a complete sample profile and stores generated email/mobile values as used. */
  async function generateFreshTestData(settings) {
    const s = settings || (root.SFFAStorage ? await root.SFFAStorage.getSettings() : {});
    setSeed(s.dataSeed);
    const { firstName, lastName, fullName } = generatePersonName(s);
    const locale = s.dataLocale || 'IN';
    const email = await generateUniqueEmail(firstName, lastName, locale);
    const mobile = await generateUniqueIndianMobile(locale);
    const organizationName = generateUniqueOrganizationName();
    const registrationNumber = generateRegistrationNumber(s.regNumberFormat);
    const paymentReference = generatePaymentReference();
    const location = generateLocation();
    const pinCode = generateTestPinCode(s.testPinCodes);
    const identityType = (s.identityFormat && s.identityFormat !== 'GENERIC') ? s.identityFormat : generateIdentityType();
    const identityNumber = generateIdentityNumber(identityType);
    const dobAndAge = generateDobAndAge();

    const alternateMobile = await generateUniqueIndianMobile(locale);
    const emergencyContactNumber = await generateUniqueIndianMobile(locale);
    const { firstName: fatherFirst } = generatePersonName(s);
    const { firstName: motherFirst } = generatePersonName(s);
    const { fullName: spouseName } = generatePersonName(s);
    const { fullName: emergencyContactName } = generatePersonName(s);
    const { fullName: nomineeName } = generatePersonName(s);

    const data = {
      firstName,
      middleName: pick(['Kumar', 'Rani', '']),
      lastName,
      fullName,
      fatherName: `${fatherFirst} ${lastName}`,
      motherName: `${motherFirst} ${lastName}`,
      spouseName,
      email,
      mobile,
      alternateMobile,
      landline: generateLandlineNumber(),
      website: generateWebsite(organizationName),
      organizationName,
      designation: pick(DESIGNATIONS),
      department: pick(DEPARTMENTS),
      occupation: pick(OCCUPATIONS),
      qualification: pick(QUALIFICATIONS),
      experience: String(randInt(0, 20)),
      registrationNumber,
      referenceNumber: `REF${randomDigits(8)}`,
      paymentReference,
      bankAccountNumber: generateBankAccountNumber(),
      creditCardNumber: generateCreditCardNumber(),
      iban: generateIban(),
      ifscCode: generateIfscCode(),
      bankName: pick(BANK_NAMES),
      gstNumber: generateGstNumber(),
      epfNumber: generateEpfNumber(),
      esiNumber: generateEsiNumber(),
      vehicleNumber: generateVehicleNumber(),
      country: pick(COUNTRIES),
      state: location.state,
      district: location.district,
      city: location.city,
      pinCode,
      addressLine: `${randInt(1, 999)}, ${pick(['MG Road', 'Station Road', 'Park Street', 'Ring Road'])}`,
      addressLine2: `Near ${pick(['City Mall', 'Central Park', 'Bus Stand', 'Railway Station'])}`,
      identityNumber,
      identityType,
      aadhaarNumber: generateAadhaar(), // for boxes labelled Aadhaar (identityNumber alone picks a random ID kind)
      panNumber: generatePanNumber(),
      cinNumber: generateCIN(),
      llpinNumber: generateLLPIN(),
      gender: pick(['Male', 'Female']),
      age: dobAndAge.age,
      dateOfBirth: dobAndAge.dateOfBirth,
      validUntil: isoDateOffsetDays(randInt(180, 1095)),
      issueDate: isoDateOffsetDays(-randInt(30, 730)),
      registrationDate: isoDateOffsetDays(-randInt(30, 1460)),
      incorporationDate: isoDateOffsetDays(-randInt(365, 9125)),
      effectiveDate: isoDateOffsetDays(-randInt(0, 30)),
      startDate: isoDateOffsetDays(-randInt(1, 14)),
      endDate: isoDateOffsetDays(randInt(14, 90)),
      genericDate: isoDate(new Date()),
      numberOfTowers: String(randInt(1, 4)),
      totalFloors: String(randInt(2, 30)),
      totalUnits: String(randInt(20, 300)),
      totalPlotArea: String(randInt(1000, 20000)),
      totalBuiltUpArea: String(randInt(800, 15000)),
      genericNumber: String(randInt(1, 20)),
      maritalStatus: pick(MARITAL_STATUSES),
      nationality: 'Indian',
      bloodGroup: pick(BLOOD_GROUPS),
      emergencyContactName,
      emergencyContactNumber,
      nomineeName,
      subject: 'Test submission - please disregard',
      message: 'This is auto-generated test data submitted for QA/testing purposes.',
      caption: CAPTION_POOL,
      observation: OBSERVATION_POOL,
      designProvision: DESIGN_PROVISION_POOL,
      supportingReference: SUPPORTING_REFERENCE_POOL,
      justification: JUSTIFICATION_POOL,
      generatedAt: new Date().toISOString(),
      seed: activeSeed
    };

    return data;
  }

  root.SFFADataGenerator = {
    setSeed, getSeed, rand,
    generateFreshTestData, generateAadhaar, generateCreditCardNumber, generateIban,
    generateUniqueEmail,
    generateUniqueIndianMobile,
    generateUniqueOrganizationName,
    generateRegistrationNumber,
    generatePaymentReference,
    generateTestPinCode,
    generateIdentityNumber,
    generateIdentityType,
    generateLocation,
    generateIfscCode,
    generateBankAccountNumber,
    generateGstNumber,
    generateVehicleNumber,
    generateWebsite,
    STATE_DISTRICT_CITY
  };
})(typeof window !== 'undefined' ? window : self);
