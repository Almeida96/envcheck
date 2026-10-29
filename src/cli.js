import { readFile } from 'node:fs/promises';
import { compareKeys, parseEnv, validateSchema, validateValues } from './index.js';

const HELP = `EnvCheck - check .env keys against an example file.

Usage:
  envcheck [options]
  node bin/envcheck.js [options]

Options:
  --example <path>  Reference file (default: .env.example)
  --env <path>      File to check (default: .env)
  --strict         Fail if extra keys are found
  --schema <path>   Validate values with a JSON schema file
  --json           Write results and errors as JSON to stdout
  -h, --help       Show help
  -v, --version    Show the version

Examples:
  envcheck
  envcheck --example .env.example --env .env.local
  envcheck --strict --json

Exit codes:
  0  Check passed
  1  Missing keys, invalid values, or extra keys in strict mode
  2  Invalid arguments, unreadable file, or syntax error

Empty values count as present. A schema can reject them. Shell variables are not read.
`;

const ISSUE_MESSAGES = {
  'invalid-assignment': 'Expected KEY=value.',
  'duplicate-key': 'Duplicate key.',
  'invalid-quoted-value': 'Unexpected text after a closing quote.',
  'unclosed-quote': 'Missing closing quote.',
  'empty-example': 'Reference file has no keys.',
};

export async function run(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const json = args.some((argument) => argument === '--json');
  const parsed = parseArguments(args);
  if (parsed.error) return reportError([parsed.error], json, stdout, stderr);

  const options = parsed.options;
  if (options.help) {
    stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    stdout.write(`${metadata.version}\n`);
    return 0;
  }

  const [example, actual] = await Promise.all([
    readEnvironment(options.example, 'example'),
    readEnvironment(options.env, 'env'),
  ]);

  const errors = [...example.errors, ...actual.errors];
  if (errors.length === 0 && example.keys.length === 0) {
    errors.push({
      code: 'empty-example',
      role: 'example',
      path: options.example,
      message: ISSUE_MESSAGES['empty-example'],
    });
  }
  if (errors.length > 0) return reportError(errors, options.json, stdout, stderr);

  const comparison = compareKeys(example.keys, actual.keys, { strict: options.strict });
  let valueIssues = [];
  if (options.schema) {
    let schema;
    try { schema = JSON.parse(await readFile(options.schema, 'utf8')); }
    catch { return reportError([{ code: 'schema-error', path: options.schema, message: 'Could not read a valid JSON schema file.' }], options.json, stdout, stderr); }
    try { validateSchema(schema, example.keys); }
    catch (error) { return reportError([{ code: 'schema-error', path: options.schema, message: error.message }], options.json, stdout, stderr); }
    valueIssues = validateValues(actual.entries, schema);
    comparison.ok &&= valueIssues.length === 0;
  }
  const exitCode = comparison.ok ? 0 : 1;
  const report = {
    schemaVersion: 1,
    status: comparison.ok ? 'pass' : 'fail',
    exitCode,
    files: { example: options.example, env: options.env },
    ...comparison,
    ...(options.schema ? { valueIssues } : {}),
  };

  if (options.json) {
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    stdout.write(formatReport(report));
  }
  return exitCode;
}

function parseArguments(args) {
  const options = { example: '.env.example', env: '.env', strict: false, json: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const normalized = flag === '-h' ? '--help' : flag === '-v' ? '--version' : flag;
    if (!['--example', '--env', '--schema', '--strict', '--json', '--help', '--version'].includes(normalized)) {
      return { error: { code: 'invalid-arguments', message: 'Unknown argument. See --help.' } };
    }
    if (seen.has(normalized)) {
      return { error: { code: 'invalid-arguments', message: `Duplicate option: ${normalized}.` } };
    }
    seen.add(normalized);

    if (['--example', '--env', '--schema'].includes(normalized)) {
      const path = args[index + 1];
      if (!path || path.startsWith('-')) {
        return { error: { code: 'invalid-arguments', message: `Option ${normalized} requires a file path.` } };
      }
      options[normalized.slice(2)] = path;
      index += 1;
    } else {
      options[normalized.slice(2)] = true;
    }
  }
  return { options };
}

async function readEnvironment(path, role) {
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    const messages = {
      ENOENT: 'File not found.',
      EACCES: 'Permission denied.',
      EPERM: 'Permission denied.',
      EISDIR: 'Path is a directory, not a file.',
    };
    return {
      keys: [],
      errors: [{ code: 'file-read-error', role, path, message: messages[error.code] ?? 'Unable to read file.' }],
    };
  }

  const { keys, issues, entries } = parseEnv(source);
  return {
    keys,
    entries,
    errors: issues.map((issue) => ({ ...issue, role, path, message: ISSUE_MESSAGES[issue.code] })),
  };
}

function reportError(errors, json, stdout, stderr) {
  if (json) {
    stdout.write(`${JSON.stringify({ schemaVersion: 1, status: 'error', ok: false, exitCode: 2, errors }, null, 2)}\n`);
  } else {
    stderr.write('EnvCheck ERROR\n');
    for (const error of errors) {
      const location = error.path ? ` ${JSON.stringify(error.path)}${error.line ? `:${error.line}` : ''}` : '';
      const key = error.key ? ` (${error.key}${error.firstLine ? `; first defined on line ${error.firstLine}` : ''})` : '';
      stderr.write(`  [${error.code}]${location} ${error.message}${key}\n`);
    }
  }
  return 2;
}

function formatReport(report) {
  const lines = [
    `EnvCheck ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    `  Reference: ${JSON.stringify(report.files.example)}`,
    `  Checking:  ${JSON.stringify(report.files.env)}`,
    `  Matched:   ${report.counts.matched}/${report.counts.expected} required keys`,
  ];

  if (report.missing.length) {
    lines.push('', `Missing (${report.missing.length}):`, ...report.missing.map((key) => `  - ${key}`));
  }
  if (report.extra.length) {
    lines.push('', `Extra (${report.extra.length}; ${report.strict ? 'not allowed in strict mode' : 'allowed'}):`, ...report.extra.map((key) => `  + ${key}`));
  }
  if (report.valueIssues?.length) {
    lines.push('', 'Invalid values:', ...report.valueIssues.map(issue => `  - ${issue.key}:${issue.line} [${issue.code}] ${issue.message}`));
  }
  lines.push('');
  return lines.join('\n');
}
