const ROLE_FIELDS = ['suspects', 'victim', 'guilty_name'];

const normalizeName = (value) => (value === null || value === undefined ? '' : String(value).trim());

const normalizeAge = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 120) return null;
  return num;
};

const normalizePersonEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const name = normalizeName(entry.name);
  if (!name) return null;
  return {
    name,
    age: normalizeAge(entry.age),
  };
};

const parseLegacyPeopleString = (value) => {
  const text = normalizeName(value);
  if (!text || text.toUpperCase() === 'N/A') return [];

  const namedWithAge = [];
  const re = /Name:\s*([^,]+?)\s+Age:\s*([^,]+)/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const name = normalizeName(match[1]);
    const rawAge = normalizeName(match[2]);
    const age = rawAge.toUpperCase() === 'UNIDENTIFIED' ? null : normalizeAge(rawAge);
    if (name) namedWithAge.push({ name, age });
  }
  if (namedWithAge.length) return namedWithAge;

  return text
    .split(',')
    .map((part) => normalizeName(part))
    .filter(Boolean)
    .map((name) => ({ name, age: null }));
};

const normalizePeopleField = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizePersonEntry).filter(Boolean);
  }

  if (value && typeof value === 'object') {
    const one = normalizePersonEntry(value);
    return one ? [one] : [];
  }

  if (typeof value === 'string') {
    return parseLegacyPeopleString(value);
  }

  return [];
};

const normalizeCasePeoplePayload = (payload = {}) => {
  const normalized = { ...payload };
  for (const field of ROLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      normalized[field] = normalizePeopleField(payload[field]);
    }
  }
  return normalized;
};

const formatPeopleField = (value) => {
  const arr = normalizePeopleField(value);
  if (!arr.length) return 'N/A';
  return arr
    .map((p) => `Name: ${p.name}   Age: ${p.age === null || p.age === undefined ? 'Unidentified' : p.age}`)
    .join(', ');
};

const serializeCaseForClient = (caseDoc) => {
  const obj = caseDoc && typeof caseDoc.toObject === 'function' ? caseDoc.toObject() : { ...caseDoc };
  for (const field of ROLE_FIELDS) {
    const rawPeople = normalizePeopleField(obj[field]);
    obj[`${field}_list`] = rawPeople;
    obj[field] = formatPeopleField(rawPeople);
  }

  // Normalize submitted_by_user so client can show human-readable submitter name.
  // When populated, submitted_by_user will be an object with user details.
  const submitUser = obj.submitted_by_user;
  if (submitUser && typeof submitUser === 'object') {
    const {_id, fullname, email, role} = submitUser;
    obj.submitted_by_user = _id || submitUser.id || submitUser._id;
    obj.submitted_by_name = fullname || '';
    obj.submitted_by_email = email || '';
    // Keep existing submitted_by_role if already set; otherwise, derive from user.role when available.
    if (!obj.submitted_by_role && role) {
      obj.submitted_by_role = role;
    }
  }

  return obj;
};

const serializeCasesForClient = (caseDocs = []) => caseDocs.map(serializeCaseForClient);

const escapeRegex = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPeopleSearchOr = (field, query) => {
  const regex = { $regex: escapeRegex(query), $options: 'i' };
  return [{ [`${field}.name`]: regex }];
};

const buildPeopleForAllSearchOr = (query) => {
  const regex = { $regex: escapeRegex(query), $options: 'i' };
  return [
    { 'suspects.name': regex },
    { 'victim.name': regex },
    { 'guilty_name.name': regex },
  ];
};

const parseQueryDateRange = (query) => {
  const text = String(query ?? '').trim();
  if (!text) return null;

  let year;
  let month;
  let day;
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  const start = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(start.getTime()) ||
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    return null;
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const buildCaseForAllSearchOr = (query) => {
  const text = String(query ?? '').trim();
  if (!text) return [];

  const escaped = escapeRegex(text);
  const regex = { $regex: escaped, $options: 'i' };
  const lowered = text.toLowerCase();
  const or = [
    { case_title: regex },
    { case_type: regex },
    { case_description: regex },
    { case_handler: regex },
    { status: regex },
    ...buildPeopleForAllSearchOr(text),
    {
      $expr: {
        $regexMatch: {
          input: { $toString: '$_id' },
          regex: escaped,
          options: 'i',
        },
      },
    },
  ];

  if (/^\d+$/.test(text)) {
    const age = Number(text);
    or.push({ 'suspects.age': age }, { 'victim.age': age }, { 'guilty_name.age': age });
  }

  if (['approved', 'approve', 'true', 'yes', '1'].includes(lowered)) {
    or.push({ isApproved: true });
  }
  if (['pending', 'false', 'no', '0'].includes(lowered)) {
    or.push({ isApproved: false });
  }

  const range = parseQueryDateRange(text);
  if (range) {
    or.push({ case_date: { $gte: range.start, $lt: range.end } });
  }

  return or;
};

module.exports = {
  ROLE_FIELDS,
  normalizePeopleField,
  normalizeCasePeoplePayload,
  formatPeopleField,
  serializeCaseForClient,
  serializeCasesForClient,
  buildPeopleSearchOr,
  buildPeopleForAllSearchOr,
  buildCaseForAllSearchOr,
};
