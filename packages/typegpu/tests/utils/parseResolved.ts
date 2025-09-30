import type * as tinyest from 'tinyest';
import tgpu from '../../src/index.ts';
import { type Assertion, expect } from 'vitest';
import type { AnyData } from '../../src/data/index.ts';
import type { UnknownData } from '../../src/data/dataTypes.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { provideCtx } from '../../src/execMode.ts';
import { CodegenState, type Wgsl } from '../../src/types.ts';
import { getMetaData } from '../../src/shared/meta.ts';
import wgslGenerator from '../../src/tgsl/wgslGenerator.ts';
import { namespace } from '../../src/core/resolve/namespace.ts';

/**
 * Just a shorthand for tgpu.resolve
 */
export function asWgsl(...values: unknown[]): string {
  return tgpu.resolve({
    // Arrays are objects with numeric keys if you thing about it hard enough
    externals: Object.fromEntries(
      values.map((v, i) => [`item_${i}`, v as Wgsl]),
    ),
    names: 'strict',
  });
}

export function expectDataTypeOf(
  cb: () => unknown,
): Assertion<AnyData | UnknownData> {
  const ctx = new ResolutionCtxImpl({
    namespace: namespace({ names: 'strict' }),
  });

  const dataType = provideCtx(
    ctx,
    () => {
      try {
        ctx.pushMode(new CodegenState());
        // Extracting the first expression from the block
        const statements = (getMetaData(cb)?.ast?.body as tinyest.Block)[1];
        if (statements.length !== 1) {
          throw new Error(
            `Expected exactly one expression, got ${statements.length}`,
          );
        }

        wgslGenerator.initGenerator(ctx);
        const exprSnippet = wgslGenerator.expression(
          statements[0] as tinyest.Expression,
        );

        return exprSnippet.dataType;
      } finally {
        ctx.popMode('codegen');
      }
    },
  );

  return expect<AnyData | UnknownData>(dataType);
}
