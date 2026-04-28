import type * as tinyest from 'tinyest';
import { NodeTypeCatalog as NODE } from 'tinyest';
import { type Assertion, expect } from 'vitest';
import tgpu, { d, ShaderGenerator, WgslGenerator } from 'typegpu';

type Snippet = ShaderGenerator.Snippet;
type UnknownData = ShaderGenerator.UnknownData;
type Origin = ShaderGenerator.Origin;

class ExtractingGenerator extends WgslGenerator {
  #fnDepth: number;

  returnedSnippet: Snippet | undefined;

  constructor() {
    super();
    this.#fnDepth = 0;
  }

  public functionDefinition(body: tinyest.Block): string {
    this.#fnDepth++;
    try {
      return super.functionDefinition(body);
    } finally {
      this.#fnDepth--;
    }
  }

  public _return(statement: tinyest.Return): string {
    if (this.#fnDepth === 1) {
      if (this.returnedSnippet) {
        throw new Error('Cannot inspect multiple return values');
      }
      if (!statement[1]) {
        throw new Error('Cannot inspect if nothing is returned');
      }
      this.returnedSnippet = this._expression(statement[1]);
      return super._return([NODE.return]);
    }

    // Proceed as usual
    return super._return(statement);
  }
}

export function extractSnippetFromFn(cb: () => unknown): Snippet {
  const generator = new ExtractingGenerator();

  tgpu.resolve([cb], { unstable_shaderGenerator: generator });

  if (!generator.returnedSnippet) {
    throw new Error('Something must be returned to be inspected');
  }

  return generator.returnedSnippet;
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
