// Gentle Shell (Pi) extension: one consented tool that registers this checkout's
// launch.mjs as a session-local, deferred MCP server. It never edits Pi's MCP configuration.
import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TERMINAL_OPERATIONS = ['batch', 'click', 'create', 'destroy', 'list', 'press', 'read', 'reset', 'resize', 'screenshot', 'scroll', 'type', 'wait'];

// The agent home holds a link to this folder; resolve it so the launcher is found in the checkout.
export const defaultLauncher = () => join(dirname(realpathSync(fileURLToPath(import.meta.url))), '..', '..', 'launch.mjs');

const CANCELLED = 'Gentle Terminal activation cancelled because the session changed or the request was aborted.';
const NO_CONSENT = 'Gentle Terminal activation requires explicit user consent through the host UI.';

export function createGentleTerminalExtension({ Type, env = process.env, launcher = defaultLauncher, timeoutMs = 5000 }) {
  return pi => {
    if (env.GENTLE_PI_AGENTS_CHILD === '1') return;
    let registeredName;
    let generation = 0;
    let pending;
    pi.on('session_shutdown', () => { generation++; registeredName = undefined; pending = undefined; });
    pi.registerTool({
      name: 'gentle_terminal_activate',
      label: 'Activate Gentle Terminal',
      description: 'Activate Gentle Terminal for interactive or persistent work. The host asks for session consent. After activation, request only needed operations by exact name; this loads their tools for the next turn. Follow the skill and existing permission gates; not for ordinary one-shot commands.',
      parameters: Type.Object({ operations: Type.Optional(Type.Array(Type.Union(TERMINAL_OPERATIONS.map(operation => Type.Literal(operation))), { minItems: 1, maxItems: 13, uniqueItems: true })) }),
      async execute(_id, params, signal, _onUpdate, ctx) {
        if (signal?.aborted) throw new Error('Gentle Terminal activation cancelled because the request was aborted.');
        const operations = params?.operations;
        if (operations !== undefined && (!Array.isArray(operations) || operations.length < 1 || operations.length > 13 || new Set(operations).size !== operations.length || operations.some(operation => !TERMINAL_OPERATIONS.includes(operation)))) throw new Error('Invalid Gentle Terminal operations.');
        if (typeof pi.registerMcpServer !== 'function') throw new Error('Gentle Terminal requires a Pi runtime with session-local MCP registration.');
        if (!registeredName) {
          if (!pending) {
            const current = generation;
            const operation = (async () => {
              if (!ctx?.hasUI || typeof ctx.ui?.confirm !== 'function') throw new Error(NO_CONSENT);
              const launch = launcher();
              if (!existsSync(launch)) throw new Error(`gentle-terminal checkout not found (${launch}); run node install.mjs from the checkout again.`);
              let consent = false;
              try {
                consent = await ctx.ui.confirm('Activate Gentle Terminal for this session?', 'This connects an interactive terminal server with your user privileges. Terminal input is not inspected by the shell-command guard. Activation does not authorize terminal actions; follow existing approval requirements.') === true;
              } catch { /* A cancelled or unavailable dialog is not consent. */ }
              if (current !== generation || signal?.aborted) throw new Error(CANCELLED);
              if (!consent) throw new Error(NO_CONSENT);
              // Pi config takes precedence over same-name extension servers. A fresh,
              // unpredictable name avoids silently selecting a configured namesake.
              const serverName = `gt_${randomBytes(16).toString('hex')}`;
              pi.registerMcpServer(serverName, {
                command: process.execPath,
                args: [launch],
                exposure: 'deferred',
                description: 'Interactive terminal sessions for shells, CLIs and TUIs; follow the Gentle Terminal skill and user approval policy.'
              });
              registeredName = serverName;
            })();
            pending = operation;
          }
          const operation = pending;
          try { await operation; } finally { if (pending === operation) pending = undefined; }
        }
        if (signal?.aborted) throw new Error('Gentle Terminal activation cancelled because the request was aborted.');
        if (operations !== undefined) {
          if (typeof pi.getAllTools !== 'function' || typeof pi.getActiveTools !== 'function' || typeof pi.setActiveTools !== 'function') throw new Error('Gentle Terminal exact tool loading is not available in this Pi runtime.');
          const current = generation;
          const names = operations.map(operation => `mcp__${registeredName}__terminal_${operation}`);
          const deadline = performance.now() + timeoutMs;
          while (true) {
            if (current !== generation || signal?.aborted) throw new Error(CANCELLED);
            const available = new Set(pi.getAllTools().filter(tool => tool.exposure !== 'hidden').map(tool => tool.name));
            if (names.every(name => available.has(name))) break;
            if (performance.now() >= deadline) throw new Error('Requested Gentle Terminal tool is not available; check /mcp for connection errors.');
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          pi.setActiveTools([...new Set([...pi.getActiveTools(), ...names])]);
          return { content: [{ type: 'text', text: `Gentle Terminal tools requested for the next turn: ${names.join(', ')}. Follow the gentle-terminal skill and user approval policy.` }], details: undefined };
        }
        return { content: [{ type: 'text', text: `Gentle Terminal registration requested for this session: ${registeredName}. When connected, call this tool with the exact operations needed; check /mcp for connection errors. Follow the gentle-terminal skill and user approval policy.` }], details: undefined };
      }
    });
  };
}
