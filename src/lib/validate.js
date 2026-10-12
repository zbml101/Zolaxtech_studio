const { HttpError } = require('./http');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message) {
  throw new HttpError(400, message);
}

function text(value, label, { min = 0, max = 200, trim = true } = {}) {
  if (typeof value !== 'string') bad(`${label} must be text.`);
  const v = trim ? value.trim() : value;
  if (v.length < min) bad(min === 1 ? `${label} cannot be empty.` : `${label} is too short.`);
  if (v.length > max) bad(`${label} is too long (the limit is ${max} characters).`);
  return v;
}

function oneOf(value, list, label) {
  if (!list.includes(value)) bad(`${label} must be one of: ${list.join(', ')}.`);
  return value;
}

function isoDate(value, label) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) bad(`${label} must be a date like 2026-10-13.`);
  const d = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) bad(`${label} is not a real date.`);
  return value;
}

function int(value, label, { min = 0, max = 1000000 } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) bad(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}

function uuid(value, label = 'id') {
  if (typeof value !== 'string' || !UUID.test(value)) bad(`That ${label} is not valid.`);
  return value;
}

function bool(value, label) {
  if (typeof value !== 'boolean') bad(`${label} must be true or false.`);
  return value;
}

// Only copy the fields we allow, and only the ones that were sent.
function pick(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Send a JSON object.');
  const out = {};
  for (const key of Object.keys(allowed)) {
    if (body[key] !== undefined) out[key] = allowed[key](body[key]);
  }
  return out;
}

module.exports = { bad, text, oneOf, isoDate, int, uuid, bool, pick };
