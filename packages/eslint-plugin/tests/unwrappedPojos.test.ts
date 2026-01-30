import { describe } from 'vitest';
import { ruleTester } from './ruleTester.ts';
import { unwrappedPojos } from '../src/rules/unwrappedPojos.ts';

describe('unwrappedPojos', () => {
  ruleTester.run('unwrappedPojos', unwrappedPojos, {
    valid: [
      'const pojo = { a: 1 };',
      // "() => { 'use gpu'; const wrapped = Schema({ a: 1 }); }",
    ],
    invalid: [
      {
        code: "() => { 'use gpu'; const pojo = { a: 1 }; }",
        errors: [
          {
            messageId: 'unwrappedPojo',
            data: { snippet: '{ a: 1 }' },
          },
        ],
      },
    ],
  });
});
