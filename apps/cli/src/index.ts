#!/usr/bin/env node
// The petal CLI (W7): thin, calls the tool registry in process, prints JSON. See main.ts.
//   pnpm petal <command>         (root script: node apps/cli/src/index.ts)
//   pnpm -s petal mcp            MCP over stdio; -s keeps pnpm's banner off stdout
import { main } from './main.ts';

export { type AnyTool, type CliDeps, isToolError, main } from './main.ts';

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
