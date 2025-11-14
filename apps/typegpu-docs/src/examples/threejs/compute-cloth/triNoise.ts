import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const tri = (x: number): number => {
  'use gpu';
  return std.abs(std.fract(x) - 0.5);
};

const tri3 = (p: d.v3f): d.v3f => {
  'use gpu';
  return d.vec3f(
    tri(p.z + tri(p.y)),
    tri(p.z + tri(p.x)),
    tri(p.y + tri(p.x)),
  );
};

/**
 * TSL.triNoise3D reimplemented in TypeGPU
 */
export const triNoise3D = tgpu.fn([d.vec3f, d.f32, d.f32], d.f32)(
  (position, speed, time) => {
    'use gpu';

    let nodeVar0 = d.vec3f(position);
    let nodeVar1 = d.f32(1.4);
    let nodeVar2 = d.f32();
    let nodeVar3 = d.vec3f(nodeVar0);
    let nodeVar4 = d.vec3f();
    let nodeVar5 = d.f32();

    for (let i = d.f32(); i <= 3.0; i += 1) {
      nodeVar4 = tri3(nodeVar3.mul(d.vec3f(2.0)));
      nodeVar0 = nodeVar0.add(nodeVar4.add(d.vec3f(time * 0.1 * speed)));
      nodeVar3 = nodeVar3.mul(d.vec3f(1.8));
      nodeVar1 = nodeVar1 * 1.5;
      nodeVar0 = nodeVar0.mul(1.2);
      nodeVar5 = tri(nodeVar0.z + tri(nodeVar0.x + tri(nodeVar0.y)));
      nodeVar2 = nodeVar2 + nodeVar5 / nodeVar1;
      nodeVar3 = nodeVar3.add(d.vec3f(0.14));
    }

    return nodeVar2;
  },
);
