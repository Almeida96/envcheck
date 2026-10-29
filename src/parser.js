/**
 * Extract keys and syntax errors from a dotenv file.
 *
 * @param {string} source
 * @returns {{ keys: string[], issues: Array<{ code: string, line: number, key?: string, firstLine?: number }> }}
 */
export function parseEnvKeys(source) {
  const { keys, issues } = parseEnv(source);
  return { keys, issues };
}

/** Parse literal values without expanding variables or evaluating shell syntax. */
export function parseEnv(source) {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const seen = new Map();
  const entries = new Map();
  const issues = [];
  let multiline = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];

    if (multiline) {
      const closing = closingQuote(line, multiline.quote);
      multiline.value += '\n' + (closing < 0 ? line : line.slice(0, closing));
      if (closing !== -1) {
        if (!validTail(line.slice(closing + 1))) {
          issues.push({ code: 'invalid-quoted-value', line: lineNumber });
        }
        entries.set(multiline.key, { value: multiline.value, line: multiline.line });
        multiline = null;
      }
      continue;
    }

    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const assignment = /^(?:export[\t ]+)?([A-Za-z_][A-Za-z0-9_]*)[\t ]*=[\t ]*(.*)$/.exec(trimmed);
    if (!assignment) {
      issues.push({ code: 'invalid-assignment', line: lineNumber });
      continue;
    }

    const [, key, value] = assignment;
    if (seen.has(key)) {
      issues.push({ code: 'duplicate-key', key, line: lineNumber, firstLine: seen.get(key) });
    } else {
      seen.set(key, lineNumber);
    }

    const quote = value[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      const closing = closingQuote(value, quote, 1);
      if (closing === -1) {
        multiline = { quote, key, value: value.slice(1), line: lineNumber };
      } else if (!validTail(value.slice(closing + 1))) {
        issues.push({ code: 'invalid-quoted-value', line: lineNumber });
      } else {
        entries.set(key, { value: value.slice(1, closing), line: lineNumber });
      }
    } else {
      entries.set(key, { value: value.split('#')[0].trim(), line: lineNumber });
    }
  }

  if (multiline) {
    issues.push({ code: 'unclosed-quote', line: multiline.line });
  }

  return { keys: [...seen.keys()].sort(), issues, entries };
}

function validTail(tail) {
  const remaining = tail.trimStart();
  return remaining.length === 0 || remaining.startsWith('#');
}

function closingQuote(text, quote, start = 0) {
  let backslashes = 0;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === quote && backslashes % 2 === 0) return index;
    backslashes = character === '\\' ? backslashes + 1 : 0;
  }
  return -1;
}
