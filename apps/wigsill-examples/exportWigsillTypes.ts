import * as fs from 'fs';

fs.writeFile(
  './src/types/wigsill-types.d.ts',
  fs.readFileSync('../../packages/wigsill/dist/index.d.ts', 'utf8'),
  () => {},
);
