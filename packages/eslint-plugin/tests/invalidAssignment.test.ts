import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { invalidAssignment } from '../src/rules/invalidAssignment.ts';

describe('invalidAssignment', () => {
  ruleTester.run('parameterAssignment', invalidAssignment, {
    valid: [
      'const fn = (a) => { a = {}; }',
      'const fn = (a) => { a.prop = 1; }',
      "const fn = (a) => { a['prop'] = 1; }",
      'const fn = (a) => { a[0] = 1; }',
      "const fn = (a) => { 'use gpu'; let x = 0; x = 1; }",
      "const fn = (a) => { 'use gpu'; { let a = 1; a = 2; } }",
      "const fn = (a) => { 'use gpu'; a.$ = 1 }",
      "const fn = (a) => { 'use gpu'; a.$++; }",
      "const fn = (a) => { 'use gpu'; a.$ += 1; }",
    ],
    invalid: [
      {
        code: "const fn = (a) => { 'use gpu'; a = 1; }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a++; }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a += 1; }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "let a; const fn = (a) => { 'use gpu'; a = 1; }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a.prop = 1; }",
        errors: [{
          messageId: 'parameterAssignment',
          data: { snippet: 'a.prop' },
        }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a['prop'] = 1; }",
        errors: [{
          messageId: 'parameterAssignment',
          data: { snippet: "a['prop']" },
        }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a[0] = 1; }",
        errors: [{
          messageId: 'parameterAssignment',
          data: { snippet: 'a[0]' },
        }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a.prop1.prop2 = 1; }",
        errors: [{
          messageId: 'parameterAssignment',
          data: { snippet: 'a.prop1.prop2' },
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
        code: "const fn = (a) => { 'use gpu'; a = 1; { let a; } }",
        errors: [{ messageId: 'parameterAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const fn = (a) => { 'use gpu'; a.$prop = 1; }",
        errors: [{
          messageId: 'parameterAssignment',
          data: { snippet: 'a.$prop' },
        }],
      },
    ],
  });

  ruleTester.run('jsAssignment', invalidAssignment, {
    valid: [
      'let a; const fn = () => { a = 1 }',
      'const outer = (a) => { const fn = () => { a = 1 } }',
      'const vars = []; const fn = () => { vars[0] = 1 }',
      "const buffer; const fn = () => { 'use gpu'; buffer.$ = 1 }",
      "const outer = (buffer) => { const fn = () => { 'use gpu'; buffer.$ = 1 } }",
      "const buffers = []; const fn = () => { 'use gpu'; buffers[0].$ = 1 }",
    ],
    invalid: [
      {
        code: "let a; const fn = () => { 'use gpu'; a = 1 }",
        errors: [{ messageId: 'jsAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const outer = (a) => { const fn = () => { 'use gpu'; a = 1 } }",
        errors: [{ messageId: 'jsAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const vars = []; const fn = () => { 'use gpu'; vars[0] = 1 }",
        errors: [{ messageId: 'jsAssignment', data: { snippet: 'vars[0]' } }],
      },
      {
        code: "let a; const fn = () => { 'use gpu'; a++; }",
        errors: [{ messageId: 'jsAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "let a; const fn = () => { 'use gpu'; a += 1; }",
        errors: [{ messageId: 'jsAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; a += 1; }; let a;",
        errors: [{ messageId: 'jsAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "const a = {}; const fn = () => { 'use gpu'; a.prop = 1; }",
        errors: [{
          messageId: 'jsAssignment',
          data: { snippet: 'a.prop' },
        }],
      },
      {
        code: "const a = {}; const fn = () => { 'use gpu'; a['prop'] = 1; }",
        errors: [{
          messageId: 'jsAssignment',
          data: { snippet: "a['prop']" },
        }],
      },
      {
        code: "const a = []; const fn = () => { 'use gpu'; a[0] = 1; }",
        errors: [{
          messageId: 'jsAssignment',
          data: { snippet: 'a[0]' },
        }],
      },
      {
        code:
          "const a = {}; const fn = () => { 'use gpu'; a.prop1.prop2 = 1; }",
        errors: [{
          messageId: 'jsAssignment',
          data: { snippet: 'a.prop1.prop2' },
        }],
      },
      {
        code: "let a; const fn = () => { 'use gpu'; if (true) { a = 1; } }",
        errors: [{ messageId: 'jsAssignment', data: { snippet: 'a' } }],
      },
      {
        code: "let a, b; const fn = () => { 'use gpu'; a = 1; b = 2; }",
        errors: [
          { messageId: 'jsAssignment', data: { snippet: 'a' } },
          { messageId: 'jsAssignment', data: { snippet: 'b' } },
        ],
      },
      {
        code: "const a = {}; const fn = () => { 'use gpu'; a.$prop = 1; }",
        errors: [{
          messageId: 'jsAssignment',
          data: { snippet: 'a.$prop' },
        }],
      },
      {
        code: "const fn = () => { 'use gpu'; globalThis.prop = 1 }",
        errors: [{
          messageId: 'jsAssignment',
          data: { snippet: 'globalThis.prop' },
        }],
      },
    ],
  });
});
