import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { uninitializedVariable } from '../src/rules/uninitializedVariable.ts';

describe('uninitializedVariable', () => {
  ruleTester.run('uninitializedVariable', uninitializedVariable, {
    valid: [
      'let a;',
      "const fn = () => { 'use gpu'; const vec = d.vec3f(); }",
      "const fn = () => { 'use gpu'; let vec = d.vec3f(); }",
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
    ],
  });
});
