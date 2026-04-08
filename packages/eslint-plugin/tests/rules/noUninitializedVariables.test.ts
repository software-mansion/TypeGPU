import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noUninitializedVariables } from '../../src/rules/noUninitializedVariables.ts';

describe('noUninitializedVariables', () => {
  ruleTester.run('noUninitializedVariables', noUninitializedVariables, {
    valid: [
      'let a;',
      'let a, b;',
      "const fn = () => { 'use gpu'; const vec = d.vec3f(); }",
      "const fn = () => { 'use gpu'; let vec = d.vec3f(); }",
      `const fn = () => { 'use gpu';
        let a = 0;
        for (const foo of tgpu.unroll([1, 2, 3])) {
          a += foo;
        }
      }`,
    ],
    invalid: [
      {
        code: "const fn = () => { 'use gpu'; let vec; }",
        errors: [
          {
            messageId: 'uninitializedVariable',
            data: { snippet: 'vec' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; let a = 1, b, c = d.vec3f(), d; }",
        errors: [
          {
            messageId: 'uninitializedVariable',
            data: { snippet: 'b' },
          },
          {
            messageId: 'uninitializedVariable',
            data: { snippet: 'd' },
          },
        ],
      },
    ],
  });
});
