import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { noUnsupportedSyntax } from '../src/rules/noUnsupportedSyntax.ts';

describe('noUnsupportedSyntax', () => {
  ruleTester.run('noUnsupportedSyntax', noUnsupportedSyntax, {
    valid: [
      // supported syntax inside 'use gpu'
      "const fn = () => { 'use gpu'; const x = 1 + 2; return x; }",
      "const fn = () => { 'use gpu'; if (x > 0) { return x; } }",
      "const fn = () => { 'use gpu'; for (let i = 0; i < 10; i++) { } }",
      "const fn = () => { 'use gpu'; for (const x of arr) { } }",
      "const fn = () => { 'use gpu'; while (x > 0) { x--; } }",
      "const fn = () => { 'use gpu'; let a = 1; }",
      "const fn = () => { 'use gpu'; const a = [1, 2, 3]; }",
      "const fn = () => { 'use gpu'; x++; }",

      // unsupported syntax outside 'use gpu' is fine
      'const x = `template`;',
      'switch (x) { case 1: break; }',
      'try { } catch(e) { }',
      'const fn = () => { const x = `template`; }',
      'const fn = () => { var x = 1; }',
    ],
    invalid: [
      {
        code: "const func = function() { 'use gpu'; const x = `hello`; }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: 'Template literals' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; switch (x) { case 1: break; } }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: 'Switch statements' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; try { } catch(e) { } }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: 'Try/catch statements' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; throw new Error('x'); }",
        errors: [
          { messageId: 'unsupportedSyntax', data: { syntax: 'Throw statements' } },
          { messageId: 'unsupportedSyntax', data: { syntax: '`new` expressions' } },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; do { } while (x); }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: 'Do/while loops' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; for (const k in obj) { } }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: 'For-in loops' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; const x = new Foo(); }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: '`new` expressions' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; (a, b); }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { syntax: 'Sequence expressions (comma operator)' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; ++x; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { syntax: 'Prefix update expressions (`++x`/`--x`)' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; var x = 1; }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: '`var` declarations' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; let a = 1, b = 2; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { syntax: 'Multiple variable declarations in one statement' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const { a } = obj; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { syntax: 'Destructuring in variable declarations' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const [a] = arr; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { syntax: 'Destructuring in variable declarations' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const x = [...arr]; }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: 'Spread elements' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; const obj = { foo() {} }; }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: 'Object method shorthand' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; const obj = { [key]: 1 }; }",
        errors: [{ messageId: 'unsupportedSyntax', data: { syntax: 'Computed property keys' } }],
      },
      {
        code: "const fn = () => { 'use gpu'; const r = /abc/; }",
        errors: [
          { messageId: 'unsupportedSyntax', data: { syntax: 'Regular expression literals' } },
        ],
      },
    ],
  });
});
