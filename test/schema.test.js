import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv, validateSchema, validateValues } from '../src/index.js';
import { run } from '../src/cli.js';

test('reads quoted, commented and multiline literal values with source locations', () => {
  const parsed = parseEnv('PORT=3000 # local\nTOKEN="secret#value"\nTEXT=`one\ntwo`\nEMPTY= # nothing');
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual([...parsed.entries.values()], [
    { value: '3000', line: 1 }, { value: 'secret#value', line: 2 },
    { value: 'one\ntwo', line: 3 }, { value: '', line: 5 },
  ]);
});

test('preserves trailing spaces within multiline quoted values', () => {
  assert.equal(parseEnv('TEXT="first  \nsecond  "').entries.get('TEXT').value, 'first  \nsecond  ');
});

test('validates types, bounds, empty values and choices without reporting secrets', () => {
  const schema = { PORT: { type: 'integer', min: 1, max: 65535 }, TOKEN: { nonEmpty: true }, TLS: { type: 'boolean' }, URL: { type: 'url' }, MODE: { enum: ['test', 'production'] } };
  validateSchema(schema, Object.keys(schema));
  const issues = validateValues(parseEnv('PORT=70000\nTOKEN=\nTLS=1\nURL=secret-value\nMODE=secret-choice').entries, schema);
  assert.deepEqual(issues.map(x => x.code), ['above-maximum', 'empty-value', 'invalid-type', 'invalid-type', 'invalid-choice']);
  assert.ok(!JSON.stringify(issues).includes('secret'));
  assert.deepEqual(validateValues(parseEnv('PORT=443\nTOKEN=abc\nTLS=true\nURL=https://localhost:3000\nMODE=test').entries, schema), []);
});

test('rejects coercion edge cases and invalid schema rules', () => {
  for (const value of ['', '1.5', 'Infinity', '0x20', '9007199254740992']) {
    assert.equal(validateValues(new Map([['PORT', { value, line: 1 }]]), { PORT: { type: 'integer' } }).length, 1);
  }
  for (const schema of [[], { UNKNOWN: {} }, { PORT: { type: 'bool' } }, { PORT: { min: 1 } }, { PORT: { type: 'number', min: 2, max: 1 } }]) assert.throws(() => validateSchema(schema, ['PORT']));
});

test('CLI schemas fail with exit 1, malformed schemas with exit 2, and never echo values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'envcheck-schema-'));
  try {
    const example = join(dir, 'example'), env = join(dir, 'actual'), schema = join(dir, 'schema.json');
    await writeFile(example, 'PORT=\n'); await writeFile(env, 'PORT=secret-do-not-print\n');
    await writeFile(schema, JSON.stringify({ PORT: { type: 'integer' } }));
    let output = '';
    const stream = { write: chunk => { output += chunk; } };
    assert.equal(await run(['--example', example, '--env', env, '--schema', schema, '--json'], { stdout: stream, stderr: stream }), 1);
    assert.equal(JSON.parse(output).valueIssues[0].key, 'PORT');
    assert.ok(!output.includes('secret-do-not-print'));
    await writeFile(schema, 'not JSON'); output = '';
    assert.equal(await run(['--example', example, '--env', env, '--schema', schema], { stdout: stream, stderr: stream }), 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
