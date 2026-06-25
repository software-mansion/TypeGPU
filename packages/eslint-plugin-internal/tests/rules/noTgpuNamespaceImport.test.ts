import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noTgpuNamespaceImport } from '../../src/rules/noTgpuNamespaceImport.ts';

describe('noTgpuNamespaceImport', () => {
  ruleTester.run('noTgpuNamespaceImport', noTgpuNamespaceImport, {
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
        code: "import * as tgpu from 'typegpu';",
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
