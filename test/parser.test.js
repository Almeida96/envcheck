import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnvKeys } from '../src/index.js';

test('reads names across BOM, CRLF, export, whitespace, comments and empty values', () => {
  const source = '\uFEFF# comment\r\n export APP_NAME = demo\r\nEMPTY=\r\n_URL=https://example.invalid?a=b # comment\r\n\r\n';
  assert.deepEqual(parseEnvKeys(source), { keys: ['APP_NAME', 'EMPTY', '_URL'], issues: [] });
});

test('ignores key-like text inside each type of multiline quote', () => {
  for (const quote of ["'", '"', '`']) {
    const source = `KEY=${quote}first line\nFAKE_NAME=inside-value\n# still a value\nlast line${quote} # comment\nACTUAL=yes`;
    assert.deepEqual(parseEnvKeys(source), { keys: ['ACTUAL', 'KEY'], issues: [] });
  }
});

test('allows quote characters in comments and unquoted values', () => {
  assert.deepEqual(parseEnvKeys('URL=https://example.invalid?a=b#"comment\nNAME=abc\'def\n'), {
    keys: ['NAME', 'URL'], issues: [],
  });
});

test('distinguishes escaped quotes from closing quotes', () => {
  const source = String.raw`MESSAGE="say \"hello\""
PATH="C:\\"
NEXT=value`;
  assert.deepEqual(parseEnvKeys(source), { keys: ['MESSAGE', 'NEXT', 'PATH'], issues: [] });
});

test('supports empty quoted values and hash signs inside quoted values', () => {
  const source = 'A=""\nB=\'\'\nC=``\nD="abc#def" # outside\n';
  assert.deepEqual(parseEnvKeys(source), { keys: ['A', 'B', 'C', 'D'], issues: [] });
});

test('tracks duplicate names and both source line numbers', () => {
  assert.deepEqual(parseEnvKeys('A=first\n# comment\nexport A=second'), {
    keys: ['A'], issues: [{ code: 'duplicate-key', key: 'A', line: 3, firstLine: 1 }],
  });
});

test('names are case-sensitive and prototype-like names are ordinary keys', () => {
  assert.deepEqual(parseEnvKeys('__proto__=x\nconstructor=y\nA=1\na=2'), {
    keys: ['A', '__proto__', 'a', 'constructor'], issues: [],
  });
});

test('reports invalid assignments by line without returning their contents', () => {
  const source = '1INVALID=sentinel-private-value\nBROKEN.LINE=sentinel-private-value\nNO_EQUALS\nOK=yes';
  const result = parseEnvKeys(source);
  assert.deepEqual(result, {
    keys: ['OK'],
    issues: [
      { code: 'invalid-assignment', line: 1 },
      { code: 'invalid-assignment', line: 2 },
      { code: 'invalid-assignment', line: 3 },
    ],
  });
  assert.ok(!JSON.stringify(result).includes('sentinel-private-value'));
});

test('reports an unfinished quoted value at its opening line', () => {
  assert.deepEqual(parseEnvKeys('# header\nTOKEN="private\nFAKE=also-private'), {
    keys: ['TOKEN'], issues: [{ code: 'unclosed-quote', line: 2 }],
  });
});

test('rejects unexpected text following same-line or multiline quoted values', () => {
  assert.deepEqual(parseEnvKeys('A="x" trailing\nB="first\nlast" trailing\nC=y'), {
    keys: ['A', 'B', 'C'],
    issues: [
      { code: 'invalid-quoted-value', line: 1 },
      { code: 'invalid-quoted-value', line: 3 },
    ],
  });
});

test('does not evaluate interpolation or command substitution', () => {
  assert.deepEqual(parseEnvKeys('A=${SECRET}\nB=$(dangerous-command)\nC=`literal text`'), {
    keys: ['A', 'B', 'C'], issues: [],
  });
});

test('handles old-style CR newlines and comment-only input', () => {
  assert.deepEqual(parseEnvKeys('A=1\rB=2'), { keys: ['A', 'B'], issues: [] });
  assert.deepEqual(parseEnvKeys('# comment\n  \n'), { keys: [], issues: [] });
});
