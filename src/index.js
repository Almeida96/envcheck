export { parseEnvKeys } from './parser.js';

/**
 * Compare case-sensitive key sets.
 * @param {Iterable<string>} expectedKeys
 * @param {Iterable<string>} actualKeys
 * @param {{ strict?: boolean }} options
 */
export function compareKeys(expectedKeys, actualKeys, { strict = false } = {}) {
  const expected = new Set(expectedKeys);
  const actual = new Set(actualKeys);
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const extra = [...actual].filter((key) => !expected.has(key)).sort();
  const matched = [...expected].filter((key) => actual.has(key)).sort();

  return {
    ok: missing.length === 0 && (!strict || extra.length === 0),
    strict,
    counts: { expected: expected.size, actual: actual.size, matched: matched.length },
    missing,
    extra,
    matched,
  };
}
