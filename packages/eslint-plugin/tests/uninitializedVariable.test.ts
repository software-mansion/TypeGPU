import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { uninitializedVariable } from '../src/rules/uninitializedVariable.ts';

describe('uninitializedVariable', () => {
  ruleTester.run('uninitializedVariable', uninitializedVariable, {
    valid: [
      'let a;',
      'let a, b;',
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
