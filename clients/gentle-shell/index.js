// Entry point Pi loads from <agent-dir>/extensions/gentle-terminal/. typebox is provided by the host.
import { Type } from 'typebox';
import { createGentleTerminalExtension } from './extension.mjs';

export default createGentleTerminalExtension({ Type });
