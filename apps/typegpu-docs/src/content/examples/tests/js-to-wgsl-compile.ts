/*
{
  "title": "JS to WGSL compile",
  "category": "simple"
}
*/

import { ResolutionCtxImpl, StrictNameRegistry, runOnGPU, tgpu } from 'typegpu';
import { f32 } from 'typegpu/data';

const foo = tgpu.fn([f32, f32], f32).impl((a, b) => a * b);

console.log(foo(3, 5));

runOnGPU(() => {
  const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });
  const code = foo(3, 5);
  console.log(ctx.resolve(code));
});
