import { it } from 'vitest';
import type { Capability } from './capabilities.js';

export function testIf(condition: boolean): typeof it {
  return (condition ? it : it.skip) as typeof it;
}

export function skipReason(caps: Capability[]): string {
  return `Requires capabilities: ${caps.join(', ')}`;
}
