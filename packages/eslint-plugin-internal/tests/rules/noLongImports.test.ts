import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noLongImports } from '../../src/rules/noLongImports.ts';

const filename = '/Users/me/typegpu-monorepo/packages/typegpu/tests/buffer.test.ts';

describe('noLongImports', () => {
  ruleTester.run('noLongImports', noLongImports, {
    valid: [
      { code: "import item from './file.ts';", filename },
      { code: "import item from '../file.ts';", filename },
      { code: "import item from '../../common/file.ts';", filename },
    ],
    invalid: [
      {
        code: "import item from '../../file.ts';",
        filename,
        errors: [
          {
            messageId: 'unexpected',
            data: { path: '../../file.ts' },
          },
        ],
      },
    ],
  });
});
