import { d, tgpu, type ColorAttachment, type TgpuRoot } from 'typegpu';

export const layout = tgpu.bindGroupLayout({
  // vec3f - world position, padding
  position: { texture: d.texture2d() },
  // vec3f - normal, padding
  normal: { texture: d.texture2d() },
  // vec3f - albedo, f32 - specular strength
  material: { texture: d.texture2d() },
});

export class GBuffer {
  destroyables: { destroy(): unknown }[] = [];

  depthTexture;
  bindGroup;
  colorAttachment;
  targets;

  constructor(root: TgpuRoot, width: number, height: number) {
    this.depthTexture = root
      .createTexture({
        size: [width, height],
        format: 'depth24plus',
      })
      .$usage('render');

    const positionTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('render', 'sampled');
    const normalTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('render', 'sampled');
    const materialTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('render', 'sampled');

    this.targets = {
      position: { format: 'rgba16float' },
      normal: { format: 'rgba16float' },
      material: { format: 'rgba16float' },
    } as const;

    this.colorAttachment = {
      position: { view: positionTexture },
      normal: { view: normalTexture },
      material: { view: materialTexture },
    } satisfies Record<string, ColorAttachment>;

    this.bindGroup = root.createBindGroup(layout, {
      position: positionTexture,
      normal: normalTexture,
      material: materialTexture,
    });

    this.destroyables.push(this.depthTexture, positionTexture, normalTexture, materialTexture);
  }

  destroy() {
    for (const item of this.destroyables) {
      item.destroy();
    }
  }
}
