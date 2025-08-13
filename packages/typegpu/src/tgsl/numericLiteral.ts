import { abstractFloat, abstractInt } from '../data/numeric.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { MAX_INT32, MIN_INT32 } from '../shared/constants.ts';

export function parseNumericString(str: string): number {
  // Hex literals
  if (/^0x[0-9a-f]+$/i.test(str)) {
    return Number.parseInt(str);
  }

  // Binary literals
  if (/^0b[01]+$/i.test(str)) {
    return Number.parseInt(str.slice(2), 2);
  }

  return Number.parseFloat(str);
}

export function numericLiteralToSnippet(value: number): Snippet {
  if (Number.isInteger(value) && value >= MIN_INT32 && value <= MAX_INT32) {
    return snip(value, abstractInt);
  }
  return snip(value, abstractFloat);
}
