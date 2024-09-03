import { describe, expect, it } from 'vitest';
import { StrictNameRegistry, builtin, wgsl } from '../src/experimental';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('builtin', () => {
  it('creates a builtin variable', () => {
    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    const code = wgsl`
      let x = ${builtin.position as unknown as symbol};
      let y = ${builtin.frontFacing as unknown as symbol};
    `;

    expect(resolutionCtx.resolve(code)).toContain('position');
    expect(resolutionCtx.resolve(code)).toContain('front_facing');
  });
});
