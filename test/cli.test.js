import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const executable = fileURLToPath(new URL('../bin/envcheck.js', import.meta.url));
const sentinel = 'SENTINEL_PRIVATE_VALUE_do_not_print_78129';

async function fixture(t, { example = `TOKEN=\nURL=\n`, env = `TOKEN=${sentinel}\nURL=https://example.invalid\n` } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'envcheck-test-'));
  t.after(async () => {
    assert.equal(dirname(directory), resolve(tmpdir()));
    assert.ok(directory.split(/[\\/]/).at(-1).startsWith('envcheck-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  if (example !== null) await writeFile(join(directory, '.env.example'), example);
  if (env !== null) await writeFile(join(directory, '.env'), env);
  return directory;
}

function invoke(cwd, args = [], environment = {}) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.ok(!result.stdout.includes(sentinel), 'stdout must never reveal a value');
  assert.ok(!result.stderr.includes(sentinel), 'stderr must never reveal a value');
  return result;
}

test('uses default paths, succeeds and does not modify either input', async (t) => {
  const cwd = await fixture(t);
  const before = await readFile(join(cwd, '.env'), 'utf8');
  const result = invoke(cwd);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /EnvCheck PASS/);
  assert.match(result.stdout, /2\/2 required/);
  assert.equal(result.stderr, '');
  assert.equal(await readFile(join(cwd, '.env'), 'utf8'), before);
});

test('reports missing and extra names with exit code 1', async (t) => {
  const cwd = await fixture(t, { env: `URL=${sentinel}\nDEBUG=true` });
  const result = invoke(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Missing \(1\):\n  - TOKEN/);
  assert.match(result.stdout, /Extra \(1; allowed\):\n  \+ DEBUG/);
  assert.equal(result.stderr, '');
});

test('only fails for extra names when strict mode is enabled', async (t) => {
  const cwd = await fixture(t, { env: `TOKEN=${sentinel}\nURL=\nDEBUG=true` });
  assert.equal(invoke(cwd).status, 0);
  assert.equal(invoke(cwd, ['--strict']).status, 1);
});

test('treats empty values as present', async (t) => {
  const cwd = await fixture(t, { env: 'TOKEN=\nURL=""' });
  assert.equal(invoke(cwd, ['--strict']).status, 0);
});

test('writes JSON to stdout and leaves stderr empty', async (t) => {
  const cwd = await fixture(t, { env: `URL=${sentinel}\nDEBUG=1` });
  const result = invoke(cwd, ['--json', '--strict']);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1,
    status: 'fail',
    exitCode: 1,
    files: { example: '.env.example', env: '.env' },
    ok: false,
    strict: true,
    counts: { expected: 2, actual: 2, matched: 1 },
    missing: ['TOKEN'], extra: ['DEBUG'], matched: ['URL'],
  });
});

test('supports explicit paths with spaces and Unicode', async (t) => {
  const cwd = await fixture(t);
  const example = join(cwd, 'reference \u03b1.example');
  const env = join(cwd, 'local config \u03b2.example');
  await writeFile(example, 'A=\n');
  await writeFile(env, `A=${sentinel}\n`);
  assert.equal(invoke(cwd, ['--example', example, '--env', env]).status, 0);
});

test('ignores inherited shell variables', async (t) => {
  const cwd = await fixture(t, { env: 'URL=\n' });
  const result = invoke(cwd, [], { TOKEN: sentinel });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /- TOKEN/);
});

test('reports both unreadable files as JSON errors', async (t) => {
  const cwd = await fixture(t, { example: null, env: null });
  const result = invoke(cwd, ['--json']);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'error');
  assert.equal(report.exitCode, 2);
  assert.equal(report.errors.length, 2);
  assert.deepEqual(report.errors.map((error) => error.role), ['example', 'env']);
  assert.ok(report.errors.every((error) => error.code === 'file-read-error'));
});

test('puts human-readable file errors on stderr', async (t) => {
  const cwd = await fixture(t, { env: null });
  const result = invoke(cwd);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /File not found/);
});

test('handles a directory passed as an environment file', async (t) => {
  const cwd = await fixture(t);
  const result = invoke(cwd, ['--env', cwd, '--json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'file-read-error');
});

test('rejects an empty reference', async (t) => {
  const cwd = await fixture(t, { example: '# no variables' });
  const result = invoke(cwd, ['--json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'empty-example');
});

test('an empty target reports every required name as missing', async (t) => {
  const cwd = await fixture(t, { env: '' });
  const result = invoke(cwd, ['--json']);
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).missing, ['TOKEN', 'URL']);
});

for (const [label, content, code] of [
  ['malformed assignment', `TOKEN=${sentinel}\n${sentinel}\nURL=`, 'invalid-assignment'],
  ['duplicate name', `TOKEN=${sentinel}\nTOKEN=${sentinel}\nURL=`, 'duplicate-key'],
  ['unclosed quote', `TOKEN="${sentinel}\nURL=`, 'unclosed-quote'],
  ['trailing content', `TOKEN="${sentinel}" ${sentinel}\nURL=`, 'invalid-quoted-value'],
]) {
  test(`sanitizes ${label} errors in text and JSON`, async (t) => {
    const cwd = await fixture(t, { env: content });
    const text = invoke(cwd);
    const json = invoke(cwd, ['--json']);
    assert.equal(text.status, 2);
    assert.equal(text.stdout, '');
    assert.equal(json.status, 2);
    assert.equal(json.stderr, '');
    assert.equal(JSON.parse(json.stdout).errors[0].code, code);
  });
}

test('validates syntax in the reference as well as the target', async (t) => {
  const cwd = await fixture(t, { example: `TOKEN="${sentinel}` });
  const result = invoke(cwd, ['--json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).errors[0].role, 'example');
});

test('ignores key-like text inside multiline values', async (t) => {
  const cwd = await fixture(t, { env: `TOKEN="first\nURL=${sentinel}\nlast"` });
  const result = invoke(cwd, ['--json']);
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).missing, ['URL']);
});

for (const args of [
  ['--unknown'], ['positional'], ['--env'], ['--example', '--strict'],
  ['--strict', '--strict'], ['--env', '.env', '--env', '.env'],
]) {
  test(`rejects invalid arguments ${JSON.stringify(args)} with a JSON error`, async (t) => {
    const cwd = await fixture(t);
    const result = invoke(cwd, [...args, '--json']);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'invalid-arguments');
  });
}

test('does not echo unknown arguments', async (t) => {
  const cwd = await fixture(t);
  const result = invoke(cwd, [`--token=${sentinel}`]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown argument/);
});

test('help and version work without environment files', async (t) => {
  const cwd = await fixture(t, { example: null, env: null });
  const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const flag of ['--help', '-h']) {
    const result = invoke(cwd, [flag]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.equal(result.stderr, '');
  }
  for (const flag of ['--version', '-v']) {
    const result = invoke(cwd, [flag]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), metadata.version);
  }
});
