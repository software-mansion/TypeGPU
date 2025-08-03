import tgpu from "typegpu";
import * as d from "typegpu/data";
// import { randf } from "@typegpu/noise";

const Boid = d.struct({
  pos: d.vec3f,
});

const createRandomBoid = tgpu.fn([], Boid)`() {
  return Boid(vec3f(0, 1, 2));
}`.$uses({ Boid });

const shaderCode = tgpu.resolve({
  externals: { createRandomBoid },
});

console.log(shaderCode);
