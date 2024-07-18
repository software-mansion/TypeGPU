import { parse } from '@wigsill/parser';
import { StrictNameRegistry, type Wgsl } from '../../src';
import { ResolutionCtxImpl } from '../../src/resolutionCtx';

export function parseWGSL(segment: Wgsl) {
  const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

  const parsed = parse(ctx.resolve(segment));
  return parsed;
}
