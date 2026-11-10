# Changelog

## Unreleased

- Reject invalid UTF-8 and bound environment/schema reads to 1 MiB instead of accepting corrupted values or unbounded input.

## 0.2.0 — 2026-10-28

Validate environment values against explicit types, choices, ranges, and nonempty rules without exposing values in reports.

## 0.1.0 (unreleased)

- Report missing and extra keys, with `--strict` and `--json` options.
- Parse quoted and multiline values; report duplicate keys and syntax errors.
- Export `parseEnvKeys` and `compareKeys` for use outside the CLI.
