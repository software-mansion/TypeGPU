import { type RenderFlag, type SampledFlag, type TgpuRoot, type TgpuTexture } from 'typegpu';

export class ScreenTextures {
  #root: TgpuRoot;
  #resolution: [number, number];

  declare depthTexture: TgpuTexture<{
    size: [number, number];
    format: 'depth24plus';
  }> &
    RenderFlag;

  declare modelTexture: TgpuTexture<{
    size: [number, number];
    format: GPUTextureFormat;
  }> &
    RenderFlag &
    SampledFlag;

  declare depthView: ReturnType<typeof createRenderView>;
  declare modelRenderView: ReturnType<typeof createRenderView>;
  #format: GPUTextureFormat;

  constructor(root: TgpuRoot, resolution: [number, number], format: GPUTextureFormat) {
    this.#format = format;
    this.#root = root;
    this.#resolution = [...resolution];
    this.recreate();
  }

  get resolution() {
    return this.#resolution;
  }

  set resolution(resolution: [number, number]) {
    if (resolution[0] === this.#resolution[0] && resolution[1] === this.#resolution[1]) {
      return;
    }

    this.#resolution = [...resolution];
    this.recreate();
  }

  recreate() {
    if (this.depthTexture) this.depthTexture.destroy();
    if (this.modelTexture) this.modelTexture.destroy();

    this.depthTexture = this.#root
      .createTexture({
        size: this.#resolution,
        format: 'depth24plus',
      })
      .$usage('render');

    this.modelTexture = this.#root
      .createTexture({
        size: this.#resolution,
        format: this.#format,
      })
      .$usage('render', 'sampled');

    this.depthView = this.depthTexture.createView('render');
    this.modelRenderView = this.modelTexture.createView('render');
  }

  destroy() {
    if (this.depthTexture) this.depthTexture.destroy();
    if (this.modelTexture) this.modelTexture.destroy();
  }
}

function createRenderView(texture: TgpuTexture & RenderFlag) {
  return texture.createView('render');
}
