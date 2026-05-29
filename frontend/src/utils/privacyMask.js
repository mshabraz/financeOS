/** Global privacy flag (synced from PrivacyProvider). Display-only — never mutates data. */
let privacyEnabled = false;

export function setPrivacyEnabled(enabled) {
  privacyEnabled = !!enabled;
}

export function isPrivacyEnabled() {
  return privacyEnabled;
}

/** Mask digits in formatted amounts (e.g. €1,234.56 → €*,***.**). */
export function maskIfPrivacy(value) {
  if (value == null || value === '') return value;
  if (!privacyEnabled) return value;
  return String(value).replace(/\d/g, '*');
}

/** Mask letters/digits in names, merchants, account labels. */
export function maskTextIfPrivacy(value) {
  if (value == null || value === '') return value;
  if (!privacyEnabled) return value;
  return String(value).replace(/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/g, '*');
}
