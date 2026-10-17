import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareKeys } from '../src/index.js';

test('returns sorted missing, extra and matched keys', () => {
  assert.deepEqual(compareKeys(['Z', 'A', 'B'], ['B', 'C', 'A']), {
    ok: false,
    strict: false,
    counts: { expected: 3, actual: 3, matched: 2 },
    missing: ['Z'], extra: ['C'], matched: ['A', 'B'],
  });
});

test('allows extra names by default and fails for them in strict mode', () => {
  assert.equal(compareKeys(['A'], ['A', 'DEBUG']).ok, true);
  assert.equal(compareKeys(['A'], ['A', 'DEBUG'], { strict: true }).ok, false);
  assert.equal(compareKeys(['A'], ['A'], { strict: true }).ok, true);
});

test('deduplicates inputs without mutating them', () => {
  const expected = Object.freeze(['B', 'A', 'A']);
  const actual = Object.freeze(['B', 'B']);
  assert.deepEqual(compareKeys(expected, actual).counts, { expected: 2, actual: 1, matched: 1 });
  assert.deepEqual(expected, ['B', 'A', 'A']);
  assert.deepEqual(actual, ['B', 'B']);
});

test('compares names case-sensitively and accepts iterable inputs', () => {
  const result = compareKeys(new Set(['TOKEN']), new Set(['token']));
  assert.deepEqual(result.missing, ['TOKEN']);
  assert.deepEqual(result.extra, ['token']);
});
