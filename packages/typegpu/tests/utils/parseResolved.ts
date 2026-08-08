import type * as tinyest from 'tinyest';
import { NodeTypeCatalog as NODE } from 'tinyest';
import { type Assertion, expect } from 'vitest';
import { tgpu, d, type TgpuFn } from 'typegpu';
import {
  type Snippet,
  UnknownData,
  type Origin,
  WgslGenerator,
  type FunctionDefinitionOptions,
} from 'typegpu/~internal';

abstract class ExtractingGenerator extends WgslGenerator {
  #fnDepth: number = 0;

  abstract latestReturnedSnippet: Snippet | undefined;

  public functionDefinition(options: FunctionDefinitionOptions): string {
    this.#fnDepth++;
    try {
      return super.functionDefinition(options);
    } finally {
      this.#fnDepth--;
    }
  }

  public _return(statement: tinyest.Return): string {
    if (this.#fnDepth === 1) {
      if (this.latestReturnedSnippet) {
        throw new Error('Cannot inspect multiple return values');
      }
      if (statement[1] === undefined) {
        throw new Error('Cannot inspect if nothing is returned');
      }
      const expectedReturnType = this.ctx.topFunctionReturnType;
      this.latestReturnedSnippet = expectedReturnType
        ? this._typedExpression(statement[1], expectedReturnType)
        : this._expression(statement[1]);
      return super._return([NODE.return]);
    }

    // Proceed as usual
    return super._return(statement);
  }
}

export function extractSnippetFromFn(cb: TgpuFn | (() => unknown)): Snippet {
  let latestReturnedSnippet: Snippet | undefined = undefined;

  tgpu.resolve([cb], {
    unstable_shaderGenerator: class extends ExtractingGenerator {
      set latestReturnedSnippet(value: Snippet | undefined) {
        latestReturnedSnippet = value;
      }
    },
  });

  if (!latestReturnedSnippet) {
    throw new Error('Something must be returned to be inspected');
  }

  return latestReturnedSnippet;
}

export function expectSnippetOf(
  cb: () => unknown,
): Assertion<[unknown, d.BaseData | UnknownData, Origin]> {
  const snippet = extractSnippetFromFn(cb);
  return expect([snippet.value, snippet.dataType, snippet.origin]);
}

export function expectDataTypeOf(cb: () => unknown): Assertion<d.BaseData | UnknownData> {
  return expect<d.BaseData | UnknownData>(extractSnippetFromFn(cb).dataType);
}

export function expectSideEffects(cb: () => unknown): Assertion<boolean> {
  return expect<boolean>(extractSnippetFromFn(cb).possibleSideEffects);
}
