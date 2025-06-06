import { parse } from 'acorn';
import type { AnyNode, Block, FuncParameter } from 'tinyest';
import { transpileFn, transpileNode } from 'tinyest-for-wgsl';

/**
 * Information extracted from transpiling a JS function.
 */
type TranspilationResult = {
  params: FuncParameter[];
  body: Block;
  /**
   * All identifiers found in the function code that are not declared in the
   * function itself, or in the block that is accessing that identifier.
   */
  externalNames: string[];
};

/**
 * Used to transpile JS resources into tinyest on demand.
 */
interface IJitTranspiler {
  transpileFn(rawJs: string): TranspilationResult;
  transpile(rawJs: string): AnyNode;
}

export class JitTranspiler implements IJitTranspiler {
  transpileFn(rawJs: string): TranspilationResult {
    const program = parse(rawJs, { ecmaVersion: 'latest' });
    return transpileFn(program);
  }

  transpile(rawJs: string): AnyNode {
    const program = parse(rawJs, { ecmaVersion: 'latest' });
    return transpileNode(program);
  }
}
