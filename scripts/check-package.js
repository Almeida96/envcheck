import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [report] = JSON.parse(await readFile(process.argv[2], 'utf8'));
const paths = new Set(report.files.map((file) => file.path));
const expected = [
  'package.json',
  'LICENSE',
  'README.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'bin/envcheck.js',
  'src/cli.js',
  'src/index.js',
  'src/parser.js',
  'examples/.env.example',
  'examples/complete.env.example',
  'examples/missing.env.example',
];

assert.deepEqual([...paths].sort(), expected.sort(), 'Unexpected package contents.');
console.log(`Package contents OK (${paths.size} files).`);
