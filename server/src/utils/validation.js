const normalizeName = (value) => (typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').toLowerCase()
  : '');
const normalizeUsername = (value) => (typeof value === 'string'
  ? value.trim().toLowerCase()
  : '');
const normalizeEmail = (value) => (typeof value === 'string'
  ? value.trim().toLowerCase()
  : '');

function validateUsername(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 32 &&
    /^[a-zA-Z0-9._-]+$/.test(value.trim());
}

function validateEmail(value) {
  return typeof value === 'string' && value.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateLoginIdentifier(value) {
  if (validateUsername(value)) return true;
  return validateEmail(value);
}

function validatePassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128 && value.trim().length > 0;
}

function validateMemberName(value) {
  if (typeof value !== 'string') return false;
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 100;
}

function validatePositiveRwf(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isDuplicateKeyError(error) {
  return Boolean(error && error.code === 11000);
}

module.exports = {
  normalizeName,
  normalizeUsername,
  normalizeEmail,
  validateUsername,
  validateEmail,
  validateLoginIdentifier,
  validatePassword,
  validateMemberName,
  validatePositiveRwf,
  isDuplicateKeyError
};
