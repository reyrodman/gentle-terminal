# Third-party notices

gentle-terminal does not vendor third-party code. The runtime dependency below is
installed per machine by `npm run setup` or `node install.mjs` from the public npm registry, verified
against the SHA-512 integrity recorded in [`runtime/package-lock.json`](runtime/package-lock.json).

| Component | Version | License | Source |
|---|---|---|---|
| terminal-use | 0.2.1 | MIT, Copyright (c) 2026 Computer Agent Labs, Inc. | [computer-agent-labs/terminal-use](https://github.com/computer-agent-labs/terminal-use) |
| JetBrains Mono (bundled by terminal-use for screenshots) | n/a | SIL Open Font License 1.1 | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono) |

terminal-use pulls in its own transitive dependencies (for example
`@lydell/node-pty`, `@xterm/headless`, `@napi-rs/canvas` and
`@modelcontextprotocol/server`), each under its own license. After installation,
their notices live in `runtime/node_modules/`. If you redistribute an installed
runtime, keep every upstream license and notice file intact.
