import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noRuntimeTypegpuImport } from '../../src/rules/noRuntimeTypegpuImport.ts';

describe('noRuntimeTypegpuImport', () => {
  ruleTester.run('noRuntimeTypegpuImport', noRuntimeTypegpuImport, {
    valid: [
      { code: "import type { TgpuRoot } from 'typegpu';" },
      { code: "import { type TgpuRoot, type TgpuBuffer } from 'typegpu';" },
      { code: "import type { d } from 'typegpu';" },
      { code: "export type { TgpuRoot } from 'typegpu';" },
      { code: "import { stepRunner } from '../runPass.ts';" },
      { code: "import type { BitonicSortDefinition } from './define.ts';" },
    ],
    invalid: [
      {
        code: "import { d } from 'typegpu';",
        errors: [{ messageId: 'valueImport' }],
      },
      {
        code: "import { tgpu, type TgpuRoot } from 'typegpu';",
        errors: [{ messageId: 'valueImport' }],
      },
      {
        code: "import * as std from 'typegpu/std';",
        errors: [{ messageId: 'valueImport' }],
      },
      {
        code: "import 'typegpu';",
        errors: [{ messageId: 'valueImport' }],
      },
      {
        code: "export { d } from 'typegpu';",
        errors: [{ messageId: 'valueImport' }],
      },
    ],
  });
});
