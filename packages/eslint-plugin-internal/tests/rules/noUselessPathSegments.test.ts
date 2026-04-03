import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noUselessPathSegments } from '../../src/rules/noUselessPathSegments.ts';
import path from 'path';

const filename = path.join(process.cwd(), 'packages', 'typegpu', 'tests', 'buffer.test.ts');

describe('noUselessPathSegments', () => {
  ruleTester.run('noUselessPathSegments', noUselessPathSegments, {
    valid: [
      { code: "import item from './file.ts';", filename },
      { code: "import item from '../file.ts';", filename },
      { code: "import item from '../../file.ts';", filename },
      { code: "import item from '../folder/file.ts';", filename },

      { code: "import item from 'eslint-plugin-typegpu';", filename },
      { code: "import item from '@eslint-plugin/typegpu';", filename },
    ],
    invalid: [
      {
        code: "import item from '../tests/file.ts';",
        filename,
        errors: [
          {
            messageId: 'redundant',
            data: { path: '../tests/file.ts', simplified: './file.ts' },
          },
        ],
        output: "import item from './file.ts';",
      },
      {
        code: 'import item from "../tests/file.ts";',
        filename,
        errors: [
          {
            messageId: 'redundant',
            data: { path: '../tests/file.ts', simplified: './file.ts' },
          },
        ],
        output: 'import item from "./file.ts";',
      },
      {
        code: "import item from './../file.ts';",
        filename,
        errors: [
          {
            messageId: 'redundant',
            data: { path: './../file.ts', simplified: '../file.ts' },
          },
        ],
        output: "import item from '../file.ts';",
      },
      {
        code: "import item from '../../typegpu/folder/file.ts';",
        filename,
        errors: [
          {
            messageId: 'redundant',
            data: { path: '../../typegpu/folder/file.ts', simplified: '../folder/file.ts' },
          },
        ],
        output: "import item from '../folder/file.ts';",
      },
    ],
  });
});
