const types = ['string', 'integer', 'number', 'boolean', 'url'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateSchema(schema, expectedKeys) {
  if (!object(schema)) throw new TypeError('Schema must be an object keyed by environment variable name.');
  const expected = new Set(expectedKeys);
  for (const [key, rule] of Object.entries(schema)) {
    if (!expected.has(key)) throw new TypeError(`Schema key ${key} is not in the reference file.`);
    if (!object(rule) || Object.keys(rule).some(name => !['type', 'nonEmpty', 'enum', 'min', 'max'].includes(name))) throw new TypeError(`Invalid schema rule for ${key}.`);
    if (rule.type !== undefined && !types.includes(rule.type)) throw new TypeError(`Invalid schema type for ${key}.`);
    if (rule.nonEmpty !== undefined && typeof rule.nonEmpty !== 'boolean') throw new TypeError(`nonEmpty must be a boolean for ${key}.`);
    if (rule.enum !== undefined && (!Array.isArray(rule.enum) || !rule.enum.length || rule.enum.some(value => typeof value !== 'string'))) throw new TypeError(`enum must be a nonempty string array for ${key}.`);
    for (const bound of ['min', 'max']) {
      if (rule[bound] !== undefined && (!['number', 'integer'].includes(rule.type) || !Number.isFinite(rule[bound]))) throw new TypeError(`${bound} requires a numeric type and finite bound for ${key}.`);
    }
    if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) throw new TypeError(`min exceeds max for ${key}.`);
  }
  return schema;
}

/** Reports names and locations only: never include values in a diagnostic. */
export function validateValues(entries, schema) {
  const issues = [];
  for (const [key, rule] of Object.entries(schema)) {
    const entry = entries.get(key);
    if (!entry) continue; // Missing keys are reported by compareKeys.
    const { value, line } = entry;
    const add = (code, message) => issues.push({ code, key, line, message });
    if (rule.nonEmpty && !value.trim()) { add('empty-value', 'Value must not be empty.'); continue; }
    let valid = true;
    if (rule.type === 'integer') valid = /^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value));
    if (rule.type === 'number') valid = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
    if (rule.type === 'boolean') valid = value === 'true' || value === 'false';
    if (rule.type === 'url') {
      try { const url = new URL(value); valid = /^https?:$/.test(url.protocol) && Boolean(url.hostname) && value === value.trim(); }
      catch { valid = false; }
    }
    if (!valid) { add('invalid-type', `Expected ${rule.type === 'url' ? 'an absolute HTTP(S) URL' : rule.type}.`); continue; }
    if (rule.enum && !rule.enum.includes(value)) add('invalid-choice', 'Value is not one of the allowed choices.');
    if (rule.min !== undefined && Number(value) < rule.min) add('below-minimum', 'Value is below the configured minimum.');
    if (rule.max !== undefined && Number(value) > rule.max) add('above-maximum', 'Value exceeds the configured maximum.');
  }
  return issues;
}
