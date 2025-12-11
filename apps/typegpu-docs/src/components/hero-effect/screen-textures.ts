import tgpu, {
  type RenderFlag,
  type SampledFlag,
  type TgpuBindGroup,
  type TgpuRoot,
  type TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';

export const postProcessLayout = tgpu.bindGroupLayout({
  inTexture: { texture: d.texture2d() },
});

export class ScreenTextures {
  #root: TgpuRoot;
  #resolution: [number, number];

  declare depthTexture:
    & TgpuTexture<{
      size: [number, number];
      format: 'depth24plus';
    }>
    & RenderFlag;

  declare modelTexture:
    & TgpuTexture<{
      size: [number, number];
      format: GPUTextureFormat;
    }>
    & RenderFlag
    & SampledFlag;

  declare postProcessGroup: TgpuBindGroup<typeof postProcessLayout['entries']>;

  constructor(root: TgpuRoot, resolution: [number, number]) {
    this.#root = root;
    this.#resolution = [...resolution];
    this.recreate();
  }

  get resolution() {
    return this.#resolution;
  }

  set resolution(resolution: [number, number]) {
    if (
      resolution[0] === this.#resolution[0] &&
      resolution[1] === this.#resolution[1]
    ) {
      return;
    }

    this.#resolution = resolution;
    this.recreate();
  }

  recreate() {
    if (this.depthTexture) this.depthTexture.destroy();
    if (this.modelTexture) this.modelTexture.destroy();

    this.depthTexture = this.#root['~unstable'].createTexture({
      size: this.#resolution,
      format: 'depth24plus',
    }).$usage('render');

    this.modelTexture = this.#root['~unstable'].createTexture({
      size: this.#resolution,
      format: navigator.gpu.getPreferredCanvasFormat(),
    }).$usage('render', 'sampled');

    this.postProcessGroup = this.#root.createBindGroup(
      postProcessLayout,
      {
        inTexture: this.modelTexture,
      },
    );
  }
}
