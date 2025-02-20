// import tgpu from '../../src';
import { JitTranspiler } from 'tgpu-jit';
import { describe, expect, it } from 'vitest';
import { StrictNameRegistry } from '../../src';
import { ResolutionCtxImpl } from '../../src/resolutionCtx';
import { generateFunction } from '../../src/smol';

const transpiler = new JitTranspiler();

describe('wgslGenerator', () => {
  it('Creates resources', () => {
    const ctx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
      jitTranspiler: transpiler,
    });

    const code = `
      function main() {
        return true;
      }
    `;

    const parsed = transpiler.transpileFn(code);
    const gen = generateFunction(ctx, parsed.body);
    console.log(gen);
    expect(true).toBe(false);
  });
});
