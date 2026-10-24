#!/usr/bin/env node
import { existsSync } from 'node:fs';
const fail = message => { console.error(`gentle-terminal: ${message}`); process.exit(1); };
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) fail('requires Node >=22.12.0.');
if (!['win32', 'linux', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) {
  fail(`unsupported platform ${process.platform}/${process.arch}; requires Windows, Linux or macOS x64/arm64 prebuilt dependencies.`);
}
const entry = new URL('./runtime/node_modules/terminal-use/bin/terminal-use.js', import.meta.url);
if (!existsSync(entry)) fail('runtime missing; run "npm run setup" in the gentle-terminal folder.');
// Import the official bin in this process: preserve argv, stdio, exits and its
// SIGINT/SIGTERM/SIGHUP + stdin-close disposal; do not introduce a child wrapper.
try { await import(entry.href); }
catch (error) { fail(`upstream startup failed: ${error.message}`); }
