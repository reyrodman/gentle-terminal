import { createHash } from 'node:crypto';

export function parseRuns(value) {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1 || n > 100) {
    throw new Error('--runs must be an integer from 1 to 100');
  }
  return n;
}

// This estimates text only, never image/base64 or JSON envelope bytes.
export function summarizeCalls(calls) {
  const sum = key => calls.reduce((n, c) => n + (c[key] ?? 0), 0);
  return { calls: calls.length, inputWireBytes: sum('sent'), outputWireBytes: sum('received'),
    textBytes: sum('textBytes'), estimatedTextTokens: Math.round(sum('textBytes') / 4) };
}

export function contractOf(tools) {
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
  return { count: tools.length, names: tools.map(t => t.name),
    sha256: createHash('sha256').update(JSON.stringify(canonical(tools))).digest('hex'),
    serialization: 'JSON with recursively sorted object keys; array order preserved' };
}

export const completed = (text, tag) => text.replace(/\r/g, '').split('\n').includes(`GT_${tag}_EXIT=3`);
export const strategyOrder = iteration => iteration % 2
  ? ['adaptive', 'optimized', 'legacy'] : ['legacy', 'optimized', 'adaptive'];
