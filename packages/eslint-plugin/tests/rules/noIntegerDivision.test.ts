import { describe } from 'vitest';
import { noIntegerDivision } from '../../src/rules/noIntegerDivision.ts';
import { ruleTester } from '../utils/ruleTester.ts';

describe('noIntegerDivision', () => {
  ruleTester.run('noIntegerDivision', noIntegerDivision, {
    valid: ['1 / 2', 'd.u32(d.u32(1) / d.u32(2))'],
    invalid: [
      {
        code: 'd.u32(1) / 2',
        errors: [{ messageId: 'intDiv', data: { snippet: 'd.u32(1) / 2' } }],
      },
      {
        code: '1 / d.u32(2)',
        errors: [{ messageId: 'intDiv', data: { snippet: '1 / d.u32(2)' } }],
      },
      {
        code: 'd.u32(1) / d.u32(2)',
        errors: [{ messageId: 'intDiv', data: { snippet: 'd.u32(1) / d.u32(2)' } }],
      },
      {
        code: 'd.i32(1) / d.i32(2)',
        errors: [{ messageId: 'intDiv', data: { snippet: 'd.i32(1) / d.i32(2)' } }],
      },
      {
        code: 'd.u32(1) / d.i32(2)',
        errors: [{ messageId: 'intDiv', data: { snippet: 'd.u32(1) / d.i32(2)' } }],
      },
      {
        code: 'u32(1) / u32(2)',
        errors: [{ messageId: 'intDiv', data: { snippet: 'u32(1) / u32(2)' } }],
      },
      {
        code: 'd.u32(1) / d.u32(2) / d.u32(3)',
        errors: [
          {
            messageId: 'intDiv',
            data: { snippet: 'd.u32(1) / d.u32(2) / d.u32(3)' },
          },
          { messageId: 'intDiv', data: { snippet: 'd.u32(1) / d.u32(2)' } },
        ],
      },
    ],
  });
});
