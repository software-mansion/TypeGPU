import { transpileFn } from '@typegpu/tgsl-tools';
import { parse } from 'acorn';
import type { JitTranspiler as IJitTranspiler } from 'typegpu/experimental';

export class JitTranspiler implements IJitTranspiler {
  transpileFn(rawJs: string) {
    const program = parse(rawJs, { ecmaVersion: 'latest' });
    return transpileFn(program);
  }
}
