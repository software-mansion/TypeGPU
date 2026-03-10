import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { math } from '../src/rules/math.ts';

describe('math', () => {
  ruleTester.run('math', math, {
    valid: [
      'const result = Math.sin(1);',
      'const t = std.sin(Math.PI)',
      "const fn = () => { 'use gpu'; const vec = std.sin(Math.PI); }",
    ],
    invalid: [
      {
        code: "const fn = () => { 'use gpu'; const vec = Math.sin(0); }",
        errors: [
          {
            messageId: 'math',
            data: { snippet: 'Math.sin(0)' },
          },
        ],
      },
    ],
  });
});
