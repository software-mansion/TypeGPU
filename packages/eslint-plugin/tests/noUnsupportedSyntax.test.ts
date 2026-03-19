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
        code: "const fn = () => { 'use gpu'; const obj = { [key]: 1 }; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: '[key]: 1', syntax: 'computed property key' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; do { } while (x); }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: 'do { } while (x);', syntax: 'do-while loop' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; for (const k in obj) { } }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: 'for (const k in obj) { }', syntax: 'for-in loop' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; let a = 1, b = 2; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: {
              snippet: 'let a = 1, b = 2;',
              syntax: 'Multiple variable declarations in one statement',
            },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const x = new Foo(); }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: 'new Foo()', syntax: "'new' expression" },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const obj = { foo() {} }; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: 'foo() {}', syntax: 'object method shorthand' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; ++x; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: '++x', syntax: 'prefix update expression (`++x`/`--x`)' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const r = /abc/; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: '/abc/', syntax: 'regular expression literal' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; (a, b); }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: 'a, b', syntax: 'sequence expression (comma operator)' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const x = [...arr]; }",
        errors: [
          { messageId: 'unsupportedSyntax', data: { snippet: '...arr', syntax: 'spread element' } },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; switch (x) { case 1: break; } }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: 'switch (x) { case 1: break; }', syntax: 'switch statement' },
          },
        ],
      },
      {
        code: "const func = function() { 'use gpu'; const x = `hello`; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: '`hello`', syntax: 'template literal' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; throw new Error('x'); }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: "throw new Error('x');", syntax: 'throw statement' },
          },
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: "new Error('x')", syntax: "'new' expression" },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; try { } catch(e) { } }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: 'try { } catch(e) { }', syntax: 'try-catch statement' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; var x = 1; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: 'var x = 1;', syntax: "'var' declaration" },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const { a } = obj; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: '{ a } = obj', syntax: 'variable declaration using destructuring' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const [a] = arr; }",
        errors: [
          {
            messageId: 'unsupportedSyntax',
            data: { snippet: '[a] = arr', syntax: 'variable declaration using destructuring' },
          },
        ],
      },
    ],
  });
});
