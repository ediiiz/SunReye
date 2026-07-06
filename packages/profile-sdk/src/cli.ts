#!/usr/bin/env bun
/**
 * `profile` — authoring CLI for SunReye inverter profiles.
 *
 *   profile validate <file>            strict validation + semantic lints
 *   profile coverage <file>            which renderable roles are mapped
 *   profile scaffold <csv> --id <id> --name <n> --manufacturer <m> [--version v]
 *
 * Exits non-zero on validation failure so it's usable as a CI/pre-commit gate.
 * Command bodies live in ./cli-commands (unit-tested); this file only parses
 * argv and dispatches.
 */

import { cmdCoverage, cmdScaffold, cmdValidate, flags } from "./cli-commands";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "validate":
    await cmdValidate(rest[0]);
    break;
  case "coverage":
    await cmdCoverage(rest[0]);
    break;
  case "scaffold":
    await cmdScaffold(rest[0], flags(rest.slice(1)));
    break;
  default:
    console.error("usage: profile <validate|coverage|scaffold> <file> [options]");
    process.exit(1);
}
