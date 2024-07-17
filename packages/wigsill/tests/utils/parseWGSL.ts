import { parse } from '@wigsill/parser';
import { StrictNameRegistry, type WGSLSegment } from '../../src';
import { ResolutionCtxImpl } from '../../src/programBuilder';

export function parseWGSL(segment: WGSLSegment) {
  const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

  const resolved = ctx.resolve(segment);

  const resolvedWithDependencies = `${ctx.dependencies.map((d) => ctx.resolve(d)).join('\n')}\n${resolved}`;

  return parse(resolvedWithDependencies);
}
