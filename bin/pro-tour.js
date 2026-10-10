#!/usr/bin/env node
// The built CLI, or the TypeScript source in a checkout that has not been built (Node strips the types).
let cli;
try {
  cli = await import('../dist/cli.js');
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !String(error.message).includes('dist/cli.js')) throw error;
  cli = await import('../src/cli.ts');
}
process.exitCode = await cli.main();
