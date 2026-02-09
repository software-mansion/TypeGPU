import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { unwrappedPojos } from '../src/rules/unwrappedPojos.ts';

describe('unwrappedPojos', () => {
  ruleTester.run('unwrappedPojos', unwrappedPojos, {
    valid: [
      // correctly wrapped
      "function func() { 'use gpu'; const wrapped = Schema({ a: 1 }); }",
      "const func = function() { 'use gpu'; const wrapped = Schema({ a: 1 }); }",
      "() => { 'use gpu'; const wrapped = Schema({ a: 1 }); }",
      "function func() { 'use gpu'; return Schema({ a: 1 }); }",
      "const func = function() { 'use gpu'; return Schema({ a: 1 }); }",
      "() => { 'use gpu'; return Schema({ a: 1 }); }",

      "() => { 'use gpu'; return Schema({ a: { b: 1 } }); }",

      // not inside 'use gpu' function
      'const pojo = { a: 1 };',
      'function func() { const unwrapped = { a: 1 }; }',
      'const func = function () { const unwrapped = { a: 1 }; }',
      '() => { const unwrapped = { a: 1 }; }',
      'function func() { return { a: 1 }; }',
      'const func = function () { return { a: 1 }; }',
      '() => { return { a: 1 }; }',

      // return from 'use gpu' function
      "function func() { 'use gpu'; return { a: 1 }; }",
      "const func = function() { 'use gpu'; return { a: 1 }; }",
      "() => { 'use gpu'; return { a: 1 }; }",

      "() => { 'use gpu'; return { a: { b: 1 } }; }",
    ],
    invalid: [
      {
        code: "function func() { 'use gpu'; const unwrapped = { a: 1 }; }",
        errors: [
          {
            messageId: 'unwrappedPojo',
            data: { snippet: '{ a: 1 }' },
          },
        ],
      },
      {
        code:
          "const func = function() { 'use gpu'; const unwrapped = { a: 1 }; }",
        errors: [
          {
            messageId: 'unwrappedPojo',
            data: { snippet: '{ a: 1 }' },
          },
        ],
      },
      {
        code: "() => { 'use gpu'; const unwrapped = { a: 1 }; }",
        errors: [
          {
            messageId: 'unwrappedPojo',
            data: { snippet: '{ a: 1 }' },
          },
        ],
      },
      {
        code:
          "function func() { 'unknown directive'; 'use gpu'; const unwrapped = { a: 1 }; }",
        errors: [
          {
            messageId: 'unwrappedPojo',
            data: { snippet: '{ a: 1 }' },
          },
        ],
      },
      {
        code: "() => { 'use gpu'; const unwrapped = { a: { b: 1 } }; }",
        errors: [
          {
            messageId: 'unwrappedPojo',
            data: { snippet: '{ a: { b: 1 } }' },
          },
        ],
      },
    ],
  });
});
