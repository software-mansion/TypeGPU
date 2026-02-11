import type * as tinyest from 'tinyest';
import { type Assertion, expect } from 'vitest';
import type { BaseData } from '../../src/data/index.ts';
import type { UnknownData } from '../../src/data/dataTypes.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { provideCtx } from '../../src/execMode.ts';
import { getMetaData } from '../../src/shared/meta.ts';
import wgslGenerator from '../../src/tgsl/wgslGenerator.ts';
import { namespace } from '../../src/core/resolve/namespace.ts';
import type { Snippet } from '../../src/data/snippet.ts';
import { $internal } from '../../src/shared/symbols.ts';
import { CodegenState } from '../../src/types.ts';

export function extractSnippetFromFn(cb: () => unknown): Snippet {
  const ctx = new ResolutionCtxImpl({
    namespace: namespace({ names: 'strict' }),
  });

  return provideCtx(
    ctx,
    () => {
      let pushedFnScope = false;
      try {
        const meta = getMetaData(cb);

        if (!meta || !meta.ast) {
          throw new Error('No metadata found for the function');
        }

        ctx.pushMode(new CodegenState());
        ctx[$internal].itemStateStack.pushItem();
        ctx[$internal].itemStateStack.pushFunctionScope(
          'normal',
          [],
          {},
          undefined,
          (meta.externals as () => Record<string, string>)() ?? {},
        );
        ctx.pushBlockScope();
        pushedFnScope = true;

        // Extracting the last expression from the block
        const statements = meta.ast.body[1] ?? [];
        if (statements.length === 0) {
          throw new Error(
            `Expected at least one expression, got ${statements.length}`,
          );
        }

        wgslGenerator.initGenerator(ctx);
        // Prewarming statements
        for (const statement of statements) {
          wgslGenerator.statement(statement);
        }
        return wgslGenerator.expression(
          statements[statements.length - 1] as tinyest.Expression,
        );
      } finally {
        if (pushedFnScope) {
          ctx.popBlockScope();
          ctx[$internal].itemStateStack.pop('functionScope');
          ctx[$internal].itemStateStack.pop('item');
        }
        ctx.popMode('codegen');
      }
    },
  );
}

export function expectSnippetOf(
  cb: () => unknown,
): Assertion<Snippet> {
  return expect(extractSnippetFromFn(cb));
}

export function expectDataTypeOf(
  cb: () => unknown,
): Assertion<BaseData | UnknownData> {
  return expect<BaseData | UnknownData>(extractSnippetFromFn(cb).dataType);
}
