import type * as tinyest from 'tinyest';
import { WeslStream } from 'wesl';
import type { TgpuResolveOptions } from '../../src/core/resolve/tgpuResolve.ts';
import tgpu from '../../src/index.ts';
import { type Assertion, expect } from 'vitest';
import type { AnyData } from '../../src/data/index.ts';
import type { UnknownData } from '../../src/data/dataTypes.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { StrictNameRegistry } from '../../src/nameRegistry.ts';
import { provideCtx } from '../../src/execMode.ts';
import { CodegenState } from '../../src/types.ts';
import { getMetaData } from '../../src/shared/meta.ts';
import wgslGenerator from '../../src/tgsl/wgslGenerator.ts';

export function parse(code: string): string {
  const stream = new WeslStream(code);
  const firstToken = stream.nextToken();
  if (firstToken === null) {
    return '';
  }

  let result = firstToken.text;
  let token = stream.nextToken();
  while (token !== null) {
    result += ` ${token.text}`;
    token = stream.nextToken();
  }
  return result;
}

export function parseResolved(
  resolvable: TgpuResolveOptions['externals'],
): string {
  const resolved = tgpu.resolve({
    externals: resolvable,
    names: 'strict',
  });

  try {
    return parse(resolved);
  } catch (e) {
    throw new Error(
      `Failed to parse the following: \n${resolved}\n\nCause:${
        String(e).substring(0, 128)
      }`,
    );
  }
}

/**
 * Just a shorthand for tgpu.resolve
 */
export function asWgsl(...values: unknown[]): string {
  return tgpu.resolve({
    // Arrays are objects with numeric keys if you thing about it hard enough
    externals: values as unknown as Record<string, object>,
    names: 'strict',
  });
}

export function expectDataTypeOf(
  cb: () => unknown,
): Assertion<AnyData | UnknownData> {
  const ctx = new ResolutionCtxImpl({
    names: new StrictNameRegistry(),
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
