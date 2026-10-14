#!/usr/bin/env node
// A checkout runs the TypeScript source (Node strips the types), so it is never behind an old build.
// An installed package has only dist/: Node does not strip types under node_modules.
import { existsSync } from 'node:fs';

const source = new URL('../src/cli.ts', import.meta.url);
const cli = await import(existsSync(source) ? source.href : '../dist/cli.js');
process.exitCode = await cli.main();
