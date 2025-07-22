import * as Babel from '@babel/standalone';
import plugin from 'unplugin-typegpu/babel';

export function translateTGSL(
  code: string,
): string {
  const result = Babel.transform(code, {
    plugins: [plugin],
  }).code;
  return result || '';
}
