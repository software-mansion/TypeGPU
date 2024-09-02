import { describe, expect, it } from 'vitest';
import { StrictNameRegistry, builtin, wgsl } from '../src/experimental';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('builtin', () => {
  it('creates a builtin variable', () => {
    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    const code = wgsl`
      let x = ${builtin.position};
      let y = ${builtin.frontFacing};
    `;

    expect(resolutionCtx.resolve(code)).toContain('position');
    expect(resolutionCtx.resolve(code)).toContain('front_facing');
  });
});
