import { integerDivision } from '../src/rules/integerDivision.ts';
import { ruleTester } from './ruleTester.ts';

ruleTester.run('integerDivision', integerDivision, {
  valid: [
    '1 / 2',
    'd.u32(1) / 2',
    '1 / d.u32(2)',
    'd.u32(d.u32(1) / d.u32(2))',
  ],
  invalid: [
    {
      code: 'd.u32(1) / d.u32(2)',
      errors: [
        { messageId: 'intDiv', data: { node: 'd.u32(1) / d.u32(2)' } },
      ],
    },
    {
      code: 'd.i32(1) / d.i32(2)',
      errors: [
        { messageId: 'intDiv', data: { node: 'd.i32(1) / d.i32(2)' } },
      ],
    },
  ],
});
