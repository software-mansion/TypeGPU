import fs from 'node:fs';
import { integerDivision } from './rules/integerDivision.ts';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const rules = {
  'integer-division': integerDivision,
};

// const recommendedRules = {
//   'typegpu/proper-buffer-names': 'error',
// };

// const allRules = Object.fromEntries(
//   Object.keys(rules).map((name) => [`typegpu/${name}`, 'error']),
// );

const plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules,
};

export default plugin;
