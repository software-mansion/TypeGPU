import { builtin, wgsl } from 'typegpu';
import { describe, expect, it } from 'vitest';
import { StrictNameRegistry } from '../src';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('builtin', () => {
  it('creates a builtin variable', () => {
    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    const code = wgsl`
      let x = ${builtin.position};
    `;

    expect(resolutionCtx.resolve(code)).toContain('position');
  });
});
