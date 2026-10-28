const { AppError } = require('./security');

const organisationId = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AppError(400, 'Invalid organisation ID');
  return value;
};

function objectFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
    throw new AppError(400, 'Invalid request fields');
  }
  return value;
}

function expiry(value, status) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new AppError(400, 'Expiry must be an ISO UTC timestamp');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new AppError(400, 'Invalid expiry date');
  // Removing an already-expired guest must remain possible.
  if (status !== 'removed' && parsed <= new Date()) throw new AppError(400, 'Expiry must be a future date');
  return parsed;
}

function queryFields(query, fields) {
  objectFields(query, fields);
  for (const value of Object.values(query)) {
    if (typeof value !== 'string' || value.length > 254 || !value.trim()) throw new AppError(400, 'Invalid query parameters');
  }
}
module.exports = { organisationId, objectFields, expiry, queryFields };
