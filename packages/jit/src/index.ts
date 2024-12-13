import { transpileFn } from '@typegpu/tgsl-tools';
import { parse } from 'acorn';
import type { Block } from 'tinyest';

/**
 * Information extracted from transpiling a JS function.
 */
type TranspilationResult = {
  argNames: string[];
  body: Block;
  /**
   * All identifiers found in the function code that are not declared in the
   * function itself, or in the block that is accessing that identifier.
   */
  externalNames: string[];
};

/**
 * Used to transpile JS resources into SMoL on demand.
 */
interface IJitTranspiler {
  transpileFn(rawJs: string): TranspilationResult;
}

export class JitTranspiler implements IJitTranspiler {
  transpileFn(rawJs: string) {
    const program = parse(rawJs, { ecmaVersion: 'latest' });
    return transpileFn(program);
  }
}
