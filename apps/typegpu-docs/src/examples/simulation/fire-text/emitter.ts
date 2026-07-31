import {
  tgpu,
  d,
  std,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuUniform,
} from 'typegpu';
import { Config } from './config.ts';

type R32Texture = TgpuTexture & SampledFlag & StorageFlag;

export const constantSourceLayout = tgpu.bindGroupLayout({
  tex: { storageTexture: d.textureStorage2d('r32float', 'read-write') },
});

export function createStampPipeline(root: TgpuRoot, configUniform: TgpuUniform<typeof Config>) {
  return root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const pos = configUniform.$.stampPos;
    const radius = configUniform.$.radius;
    const softBrush = configUniform.$.isSoft;

    const dx = d.i32(x) - d.i32(radius);
    const dy = d.i32(y) - d.i32(radius);
    const px = d.i32(pos.x) + dx;
    const py = d.i32(pos.y) + dy;

    const dist = std.length(d.vec2f(d.f32(dx), d.f32(dy)));
    const fRadius = d.f32(radius);
    const texSize = d.i32(configUniform.$.textureSize);

    if (px >= 0 && px < texSize && py >= 0 && py < texSize) {
      if (dist <= fRadius) {
        let weight = d.f32(1.0);
        if (softBrush === 1) {
          weight = d.f32(1.0) - std.smoothstep(fRadius * 0.05, fRadius, dist);
        }
        const old = std.textureLoad(constantSourceLayout.$.tex, d.vec2u(d.u32(px), d.u32(py))).x;
        std.textureStore(
          constantSourceLayout.$.tex,
          d.vec2u(d.u32(px), d.u32(py)),
          d.vec4f(std.max(old, weight), 0.0, 0.0, 0.0),
        );
      }
    }
  });
}

export function createEmitterBindGroup(
  root: TgpuRoot,
  resources: { constantSourceGrid: R32Texture },
): TgpuBindGroup {
  return root.createBindGroup(constantSourceLayout, {
    tex: resources.constantSourceGrid,
  });
}
