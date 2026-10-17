# Contributing

Use Node.js 22+ and run `node --test`. No dependencies to install.

When reporting a bug, include the command, its output, what you expected and a minimal `.env` file that reproduces it. Replace credentials with dummy values.

For pull requests:

- Add a regression test when changing parsing or comparison behavior.
- Keep values out of output, including error messages.
- Update the README if an option or supported syntax changes.
- Preserve the documented exit codes and JSON fields.

File syntax is handled in `src/parser.js`, key comparison in `src/index.js`, and file reads and terminal output in `src/cli.js`.

## Releases

Update the version in `package.json` and add a changelog entry. Run the tests, check the file list with `npm pack --dry-run`, then create the archive with `npm pack`. Extract it and run `--help`, `--version` and the examples from that copy.

Before publishing to npm, choose an available package name. CI does not publish releases.
