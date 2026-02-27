import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { invalidAssignment } from '../src/rules/invalidAssignment.ts';

// TODO: non-param assign
// TODO: +=, ++, -- etc
// TODO: array access
// TODO: props
// TODO: check default params
// TODO: allow js
// TODO: allow .$ (?)
describe('invalidAssignment', () => {
  ruleTester.run('parameterAssignment', invalidAssignment, {
    valid: [
      'const fn = (a) => { a = {}; a.prop = 1; }',
      "const fn = (a) => { 'use gpu'; let x = 0; x = 1; }",
      "const fn = (a) => { 'use gpu'; { let a = 1; a = 2; } }",
    ],
    invalid: [
      {
        code: "const fn = (a) => { 'use gpu'; a = 1; }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "let a; const fn = (a) => { 'use gpu'; a = 1; }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a.x = 1; }",
        errors: [{
          messageId: 'parameterAssignment',
          data: { snippet: 'a.x' },
        }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a.x.y = 1; }",
        errors: [{
          messageId: 'parameterAssignment',
          data: { snippet: 'a.x.y' },
        }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; if (true) { a = 1; } }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const fn = (a, b) => { 'use gpu'; a = 1; b = 2; }",
        errors: [
          { messageId: 'parameterAssignment', data: { snippet: 'a' } },
          { messageId: 'parameterAssignment', data: { snippet: 'b' } },
        ],
      },
      {
        code:
          "const outer = (a) => { 'use gpu'; const inner = (b) => { 'use gpu'; b = 1; }; }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'b' } }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a = 1; { let a; } }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a = 1; let a; }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
    ],
  });
});
