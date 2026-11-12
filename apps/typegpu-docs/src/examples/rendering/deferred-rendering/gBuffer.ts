import { d, tgpu, type ColorAttachment, type TgpuRoot } from 'typegpu';

export const layout = tgpu.bindGroupLayout({
  position: { texture: d.texture2d(d.f32) },
  normal: { texture: d.texture2d(d.f32) },
  albedo: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' },
});

export class GBuffer {
  root: TgpuRoot;
  destroyables: { destroy(): unknown }[] = [];
  bindGroup;
  colorAttachment;
  targets;

  constructor(root: TgpuRoot, width: number, height: number) {
    this.root = root;
    const textures = {
      position: this.root
        .createTexture({ size: [width, height], format: 'rgba16float' })
        .$usage('sampled', 'render'),
      normal: this.root
        .createTexture({ size: [width, height], format: 'rgba16float' })
        .$usage('sampled', 'render'),
      albedo: this.root
        .createTexture({ size: [width, height], format: 'rgba16float' })
        .$usage('sampled', 'render'),
    };
    const sampler = root.createSampler({});
    this.bindGroup = root.createBindGroup(layout, {
      position: textures.position,
      normal: textures.normal,
      albedo: textures.albedo,
      sampler,
    });
    this.destroyables.push(...Object.values(textures));
    this.colorAttachment = {
      position: { view: textures.position.createView(d.texture2d(d.f32)) },
      normal: { view: textures.normal.createView(d.texture2d(d.f32)) },
      albedo: { view: textures.albedo.createView(d.texture2d(d.f32)) },
    } satisfies Record<string, ColorAttachment>;
    this.targets = {
      position: { format: 'rgba16float' },
      normal: { format: 'rgba16float' },
      albedo: { format: 'rgba16float' },
    } as const;
  }

  destroy() {
    for (const item of this.destroyables) {
      item.destroy();
    }
  }
}
