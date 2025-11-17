import { expect, it } from 'vitest';
import { rules } from '../src/configs.ts';

it('uses the same names for rules and exports', () => {
  for (const key in rules) {
    expect(rules[key as keyof typeof rules].name).toBe(key);
  }
});
