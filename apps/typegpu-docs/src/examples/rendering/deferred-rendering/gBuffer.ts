import { d, tgpu, type ColorAttachment, type TgpuRoot } from 'typegpu';

export const layout = tgpu.bindGroupLayout({
  position: { storageTexture: d.textureStorage2d('rgba16float', 'read-only'), access: 'readonly' },
  normal: { storageTexture: d.textureStorage2d('rgba16float', 'read-only'), access: 'readonly' },
  albedo: { storageTexture: d.textureStorage2d('rgba16float', 'read-only'), access: 'readonly' },
});

export class GBuffer {
  destroyables: { destroy(): unknown }[] = [];

  bindGroup;
  colorAttachment;
  targets;

  constructor(root: TgpuRoot, width: number, height: number) {
    const positionTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('render', 'storage');
    const normalTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('render', 'storage');
    const albedoTexture = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('render', 'storage');

    this.targets = {
      position: { format: 'rgba16float' },
      normal: { format: 'rgba16float' },
      albedo: { format: 'rgba16float' },
    } as const;

    this.colorAttachment = {
      position: { view: positionTexture },
      normal: { view: normalTexture },
      albedo: { view: albedoTexture },
    } satisfies Record<string, ColorAttachment>;

    this.bindGroup = root.createBindGroup(layout, {
      position: positionTexture,
      normal: normalTexture,
      albedo: albedoTexture,
    });

    this.destroyables.push(positionTexture, normalTexture, albedoTexture);
  }

  destroy() {
    for (const item of this.destroyables) {
      item.destroy();
    }
  }
}
