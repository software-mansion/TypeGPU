import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noTgpuDefaultImport } from '../../src/rules/noTgpuDefaultImport.ts';

describe('noTgpuDefaultImport', () => {
  ruleTester.run('noTgpuDefaultImport', noTgpuDefaultImport, {
    valid: [
      { code: "import { tgpu } from 'typegpu';" },
      { code: 'import { tgpu, d } from "typegpu";' },
      { code: "import { tgpu } from '../../../src/index.js';" },
      { code: "import { tgpu, d } from '../../../src/index.js';" },
    ],
    invalid: [
      {
        code: "import tgpu from 'typegpu';",
        errors: [{ messageId: 'oldImport' }],
      },
      {
        code: "import tgpu, { d } from 'typegpu';",
        errors: [{ messageId: 'oldImport' }],
      },
      {
        code: "import tgpu from '../../../src/index.js';",
        errors: [{ messageId: 'oldImport' }],
      },
    ],
  });
});
