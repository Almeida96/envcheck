# EnvCheck

Compares the variable names in `.env` with `.env.example` and lists missing or extra keys.

Node.js 22+, no dependencies.

## Usage

From the repository directory:

```sh
node bin/envcheck.js --example ../my-app/.env.example --env ../my-app/.env
```

Without options, it looks for `.env.example` and `.env` in the current directory. Paths with spaces need quotes.

To try the included examples:

```sh
node bin/envcheck.js --example examples/.env.example --env examples/missing.env.example
```

```text
EnvCheck FAIL

  Reference: "examples/.env.example"
  Checking:  "examples/missing.env.example"
  Matched:   3/4 required keys

Missing (1):
  - API_TOKEN

Extra (1; allowed):
  + DEBUG
```

This example exits with code `1`. Replace `missing.env.example` with `complete.env.example` for a passing check.

| Option | Default | Description |
| --- | --- | --- |
| `--example <path>` | `.env.example` | File listing the required keys. |
| `--env <path>` | `.env` | File to check. |
| `--strict` | Off | Fail on extra keys too. |
| `--json` | Off | Output JSON, including errors. |
| `-h`, `--help` | | Show help. |
| `-v`, `--version` | | Show version. |

## Behavior

Every key in the reference file is required. Names are case-sensitive: `TOKEN` and `token` are different keys. Extra keys are allowed unless `--strict` is set.

An empty assignment such as `API_TOKEN=` counts as present. Values are neither printed nor validated. The check reads the two files without modifying them or using variables from the shell.

Files must use UTF-8; BOM and LF, CRLF or CR line endings are accepted. Keys must match `[A-Za-z_][A-Za-z0-9_]*`. Comments, the `export` prefix and spaces around `=` are allowed.

Values can be unquoted or enclosed in single quotes, double quotes or backticks. Quoted values can span lines. A quote preceded by an odd number of backslashes is treated as part of the value. Only whitespace or a `#` comment may follow a closing quote.

Duplicate keys, malformed assignments, unclosed quotes and an empty reference file cause an error. Variable interpolation and shell commands are not evaluated.

## CI and JSON

```sh
node bin/envcheck.js --example .env.example --env .env.local --strict --json
```

| Exit code | Meaning |
| --- | --- |
| `0` | Check passed. |
| `1` | Missing keys, or extra keys in strict mode. |
| `2` | Invalid arguments, unreadable file or invalid file syntax. |

JSON reports include `schemaVersion: 1`, `status`, `ok` and `exitCode`. Completed checks add `files`, `strict`, `counts`, `missing`, `extra` and `matched`. Key lists are sorted.

Input errors return an `errors` array instead of comparison results. Each item has `code` and `message`. File errors include `role` and `path`; syntax errors add `line`. Duplicate keys also include `key` and `firstLine`.

JSON goes to stdout, including errors. In text mode, input errors go to stderr. Reports contain file paths and key names, but no values.

`--help` and `--version` always produce text. Separate options and their arguments with spaces. Repeated and unknown options are rejected.

## API

```js
import { parseEnvKeys, compareKeys } from './src/index.js';

const reference = parseEnvKeys('API_URL=\nAPI_TOKEN=');
const actual = parseEnvKeys('API_URL=https://example.invalid');

if (reference.issues.length || actual.issues.length) {
  throw new Error('Invalid env file');
}

const result = compareKeys(reference.keys, actual.keys, { strict: true });
console.log(result.missing); // ['API_TOKEN']
```

`parseEnvKeys` returns `{ keys, issues }`. If `issues` is not empty, fix the syntax errors before comparing: `keys` may be incomplete. `compareKeys` accepts iterables of key names.

## Development

```sh
node --test
npm pack
```

`node --test` runs the tests; `npm pack` creates the package. Neither requires a build or dependency installation. Use `npm run demo` for the passing example, or `npm test` as an alias for the tests.

The [CI workflow](.github/workflows/ci.yml) runs the tests on Node 22 and 24 on Linux, Windows and macOS. It also checks the package contents and runs the packaged CLI.

[Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [MIT license](LICENSE)
