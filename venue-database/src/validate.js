// Field validators — pure, no platform deps. Shared by the Node server (via
// util.js) and the Cloudflare Worker so both apply identical rules/messages.
import { HttpError } from './errors.js';

export function str(value, { field, required = false, min = 0, max = 2000 } = {}) {
  if (value == null || value === '') {
    if (required) throw new HttpError(422, `"${field}" is required`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(422, `"${field}" must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new HttpError(422, `"${field}" must be at least ${min} characters`);
  if (trimmed.length > max) throw new HttpError(422, `"${field}" must be at most ${max} characters`);
  return trimmed;
}

export function num(value, { field, required = false, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new HttpError(422, `"${field}" is required`);
    return null;
  }
  const n = Number(value);
  if (Number.isNaN(n)) throw new HttpError(422, `"${field}" must be a number`);
  if (integer && !Number.isInteger(n)) throw new HttpError(422, `"${field}" must be a whole number`);
  if (n < min || n > max) throw new HttpError(422, `"${field}" must be between ${min} and ${max}`);
  return n;
}
