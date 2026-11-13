import { d, tgpu, type ColorAttachment, type TgpuRoot } from 'typegpu';

export const layout = tgpu.bindGroupLayout({
  position: { texture: d.texture2d(d.f32) },
  normal: { texture: d.texture2d(d.f32) },
  albedo: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' },
});

export class GBuffer {
  destroyables: { destroy(): unknown }[] = [];

  bindGroup;
  colorAttachment;
  targets;

  constructor(root: TgpuRoot, width: number, height: number) {
    const positionTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('sampled', 'render');
    const normalTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('sampled', 'render');
    const albedoTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('sampled', 'render');

    this.targets = {
      position: { format: 'rgba16float' },
      normal: { format: 'rgba16float' },
      albedo: { format: 'rgba16float' },
    } as const;

    this.colorAttachment = {
      position: { view: positionTexture.createView(d.texture2d(d.f32)) },
      normal: { view: normalTexture.createView(d.texture2d(d.f32)) },
      albedo: { view: albedoTexture.createView(d.texture2d(d.f32)) },
    } satisfies Record<string, ColorAttachment>;

    const sampler = root.createSampler({});
    this.bindGroup = root.createBindGroup(layout, {
      position: positionTexture,
      normal: normalTexture,
      albedo: albedoTexture,
      sampler,
    });

    this.destroyables.push(positionTexture, normalTexture, albedoTexture);
  }

  destroy() {
    for (const item of this.destroyables) {
      item.destroy();
    }
  }
}
