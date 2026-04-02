import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noUnsupportedSyntax } from '../../src/rules/noUnsupportedSyntax.ts';

describe('noUnsupportedSyntax', () => {
  ruleTester.run('noUnsupportedSyntax', noUnsupportedSyntax, {
    valid: [
      "const fn = () => { 'use gpu'; const x = 1; }",
      "const fn = () => { 'use gpu'; const x = Struct({ prop: 1}); }",
      "const fn = () => { 'use gpu'; let x = 1; }",
    ],
    invalid: [
      {
        code: "const fn = () => { 'use gpu'; const nested = () => {}; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '() => {}', syntax: 'arrow function' },
          },
        ],
      },
      {
        code: "const fn = (arg = 1) => { 'use gpu'; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'arg = 1', syntax: 'assignment pattern (default parameter)' },
          },
        ],
      },
      {
        code: "function fn(arg = 1) { 'use gpu'; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'arg = 1', syntax: 'assignment pattern (default parameter)' },
          },
        ],
      },
      {
        code: "const fn = function(arg = 1) { 'use gpu'; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'arg = 1', syntax: 'assignment pattern (default parameter)' },
          },
        ],
      },
      {
        code: "const fn = async () => { 'use gpu'; await foo(); }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'await foo()', syntax: 'await expression' },
          },
        ],
      },
      {
        code: "const fn = async () => { 'use gpu'; if (1 == 2) { return true; } else { return false; } }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '1 == 2', syntax: 'eqeq' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; class Foo {} }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'class Foo {}', syntax: 'class declaration' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const Foo = class {}; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'class {}', syntax: 'class expression' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; do { } while (x); }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'do { } while (x);', syntax: 'do-while loop' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; for (const k in obj) { } }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'for (const k in obj) { }', syntax: 'for-in loop' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; function nested() {} }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'function nested() {}', syntax: 'function declaration' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const nested = function() {}; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'function() {}', syntax: 'function expression' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const obj = { foo() {} }; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '() {}', syntax: 'function expression' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const r = /abc/; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '/abc/', syntax: 'regular expression literal' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const x = new Foo(); }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'new Foo()', syntax: "'new' expression" },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; obj.#buffer.$ = 1; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '#buffer', syntax: 'private identifier' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const obj = { [key]: 1 }; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '[key]: 1', syntax: 'computed property key' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; (a, b); }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'a, b', syntax: 'sequence expression (comma operator)' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const x = [...arr]; }",
        errors: [
          { messageId: 'unexpected', data: { snippet: '...arr', syntax: 'spread element' } },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; switch (x) { case 1: break; } }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'switch (x) { case 1: break; }', syntax: 'switch statement' },
          },
        ],
      },
      {
        code: "const func = function() { 'use gpu'; const x = `hello`; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '`hello`', syntax: 'template literal' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const x = tag`hello`; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '`hello`', syntax: 'template literal' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; throw new Error('x'); }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: "throw new Error('x');", syntax: 'throw statement' },
          },
          {
            messageId: 'unexpected',
            data: { snippet: "new Error('x')", syntax: "'new' expression" },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; try { } catch(e) { } }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'try { } catch(e) { }', syntax: 'try-catch statement' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; ++x; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '++x', syntax: 'prefix update expression' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; var x = 1; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'var x = 1;', syntax: "'var' declaration" },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; let a = 1, b = 2; }",
        errors: [
          {
            messageId: 'unexpected',
            data: {
              snippet: 'let a = 1, b = 2;',
              syntax: 'Multiple variable declarations in one statement',
            },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const { a } = obj; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '{ a } = obj', syntax: 'variable declaration using destructuring' },
          },
        ],
      },
      {
        code: "const fn = () => { 'use gpu'; const [a] = arr; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: '[a] = arr', syntax: 'variable declaration using destructuring' },
          },
        ],
      },
      {
        code: "function* fn() { 'use gpu'; yield 1; }",
        errors: [
          {
            messageId: 'unexpected',
            data: { snippet: 'yield 1', syntax: 'yield expression' },
          },
        ],
      },
    ],
  });
});
