#!/usr/bin/env node
// The petal CLI (W7): thin, calls the tool registry in process, prints JSON.
// Subcommands: networks, snapshot, describe, figures, compare, propose, validate, render, mcp, api.
//   pnpm petal <subcommand>      (root script: node apps/cli/src/index.ts)
import { NotImplementedError } from '@petal/core';

export async function main(argv: string[]): Promise<number> {
  const [command = 'help'] = argv;
  const error = new NotImplementedError(`petal ${command} (W7, milestone M1)`);
  process.stderr.write(
    `${JSON.stringify({ error: { code: error.code, message: error.message } })}\n`,
  );
  return 1;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
