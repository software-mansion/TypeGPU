import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { spreadOperator } from '../src/rules/spreadOperator.ts';

describe('spreadOperator', () => {
  ruleTester.run('spreadOperator', spreadOperator, {
    valid: [
      'const result = call(...arguments);',
      'const t = [1, 2, ...v, 6];',
      "const o = { ...other, prop: 'value' };",
    ],
    invalid: [
      {
        code: "const fn = () => { 'use gpu'; const vec = d.vec3f(...args); }",
        errors: [
          {
            messageId: 'spreadOperator',
            data: { snippet: '...args' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const t = [1, 2, ...v, 6]; }",
        errors: [
          {
            messageId: 'spreadOperator',
            data: { snippet: '...v' },
          },
        ],
      },
    ],
  });
});
