import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noMath } from '../../src/rules/noMath.ts';

describe('noMath', () => {
  ruleTester.run('noMath', noMath, {
    valid: [
      'const result = Math.sin(1);',
      'const t = std.sin(Math.PI)',
      "const fn = () => { 'use gpu'; const vec = std.sin(Math.PI); }",
      "const Math = { sin: std.sin }; const fn = () => { 'use gpu'; const vec = Math.sin(0); }",
      "import Math from 'utils'; const fn = () => { 'use gpu'; const vec = Math.sin(0); }",
    ],
    invalid: [
      {
        code: "const fn = () => { 'use gpu'; const vec = Math.sin(0); }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'Math.sin(0)' },
          },
        ],
      },
    ],
  });
});
