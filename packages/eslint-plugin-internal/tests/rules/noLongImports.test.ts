import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noLongImports } from '../../src/rules/noLongImports.ts';

describe('noLongImports', () => {
  ruleTester.run('noLongImports', noLongImports, {
    valid: [
      { code: "import item from './file.ts';" },
      { code: "import item from '../file.ts';" },
      { code: "import item from '../../common/file.ts';" },
    ],
    invalid: [
      {
        code: "import item from '../../file.ts';",
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
