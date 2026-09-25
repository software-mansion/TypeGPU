import { tgpu, d, std, type TgpuRoot, type TgpuTexture, type SampledFlag } from 'typegpu';
import { captureRadius, frameResolution, modelRadius, viewsPerAxis } from './impostor.ts';

const padding = Math.round(((captureRadius - modelRadius) / (2 * captureRadius)) * frameResolution);

const layout = tgpu.bindGroupLayout({
  source: { texture: d.texture2dArray(), sampleType: 'unfilterable-float' },
  target: { storageTexture: d.textureStorage2dArray('r32float', 'write-only') },
});
const pad = tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { id: d.builtin.globalInvocationId },
})(({ id }) => {
  'use gpu';
  const pixel = d.vec2i(id.xy);
  let result = std.textureLoad(layout.$.source, pixel, id.z, 0).r;
  if (result === 0) {
    let closest = d.i32(3);
    for (const y of std.range(-1, 2)) {
      for (const x of std.range(-1, 2)) {
        const distance = x * x + y * y;
        const neighbor = std.clamp(pixel + d.vec2i(x, y), d.vec2i(0), d.vec2i(frameResolution - 1));
        const candidate = std.textureLoad(layout.$.source, neighbor, id.z, 0).r;
        if (candidate > 0 && distance < closest) {
          result = candidate;
          closest = distance;
        }
      }
    }
  }
  std.textureStore(layout.$.target, pixel, id.z, d.vec4f(result, 0, 0, 0));
});

export function padDepth(root: TgpuRoot, depth: TgpuTexture & SampledFlag) {
  const size = [frameResolution, frameResolution, viewsPerAxis ** 2] as const;
  const targets = [0, 1].map(() =>
    root.createTexture({ size, format: 'r32float' }).$usage('storage', 'sampled'),
  );
  const pipeline = root.createComputePipeline({ compute: pad });
  const encoder = root['~unstable'].createCommandEncoder();
  for (let step = 0; step < padding; step++) {
    const source = step === 0 ? depth : targets[(step + 1) % 2];
    const bindGroup = root.createBindGroup(layout, {
      source: source.createView(d.texture2dArray(), { sampleType: 'unfilterable-float' }),
      target: targets[step % 2].createView(d.textureStorage2dArray('r32float', 'write-only')),
    });
    pipeline
      .with(encoder)
      .with(bindGroup)
      .dispatchWorkgroups(frameResolution / 8, frameResolution / 8, viewsPerAxis ** 2);
  }
  encoder.submit();
  const result = targets[(padding - 1) % 2];
  targets[padding % 2].destroy();
  return result;
}
