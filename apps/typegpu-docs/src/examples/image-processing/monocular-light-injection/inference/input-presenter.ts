import { common, d, std, tgpu } from 'typegpu';
import type { StorageFlag, TgpuBuffer, TgpuRenderPipeline, TgpuRoot, UniformFlag } from 'typegpu';

const InputParams = d.struct({
  inputSize: d.vec2u,
});

const inputLayout = tgpu.bindGroupLayout({
  params: { uniform: InputParams },
  input: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
});

const IMAGE_NET_MEAN = d.vec3f(0.485, 0.456, 0.406);
const IMAGE_NET_STD = d.vec3f(0.229, 0.224, 0.225);

export class DepthInputPresenter {
  readonly #root: TgpuRoot;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #params: TgpuBuffer<typeof InputParams> & UniformFlag;
  readonly #pipeline: TgpuRenderPipeline<d.Vec4f>;
  #inputAlias: (TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag) | undefined;
  #bindGroup: ReturnType<TgpuRoot['createBindGroup']> | undefined;
  #destroyed = false;

  constructor(root: TgpuRoot, canvas: HTMLCanvasElement) {
    this.#root = root;
    this.#canvas = canvas;
    this.#context = root.configureContext({ canvas, alphaMode: 'opaque' });
    this.#params = root.createBuffer(InputParams, { inputSize: d.vec2u(1) }).$usage('uniform');
    this.#pipeline = root
      .createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          const size = inputLayout.$.params.inputSize;
          const pixel = d.vec2u(uv * d.vec2f(size));
          const x = std.min(pixel.x, size.x - 1);
          const y = std.min(pixel.y, size.y - 1);
          const normalized = inputLayout.$.input[y * size.x + x].rgb;
          const rgb = std.clamp(
            normalized * IMAGE_NET_STD + IMAGE_NET_MEAN,
            d.vec3f(0),
            d.vec3f(1),
          );
          return d.vec4f(rgb, 1);
        },
        targets: { format: navigator.gpu.getPreferredCanvasFormat() },
      })
      .$name('DepthART model input presenter');
  }

  async initAsync(): Promise<void> {
    this.#assertAlive();
    await this.#pipeline.initAsync();
  }

  attach(inputBuffer: GPUBuffer, width: number, height: number): void {
    this.#assertAlive();
    this.detach();
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#inputAlias = this.#root
      .createBuffer(d.arrayOf(d.vec4f, width * height), inputBuffer)
      .$usage('storage');
    this.#bindGroup = this.#root.createBindGroup(inputLayout, {
      params: this.#params,
      input: this.#inputAlias,
    });
    this.#params.write({ inputSize: d.vec2u(width, height) });
  }

  detach(): void {
    this.#inputAlias?.destroy();
    this.#inputAlias = undefined;
    this.#bindGroup = undefined;
  }

  encode(encoder: GPUCommandEncoder): void {
    this.#assertAlive();
    if (!this.#bindGroup) {
      throw new Error('No model input buffer is attached to the presenter.');
    }
    this.#pipeline
      .with(this.#bindGroup)
      .with(encoder)
      .withColorAttachment({ view: this.#context })
      .draw(3);
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.detach();
    this.#params.destroy();
    this.#context.unconfigure();
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('The model input presenter has been destroyed.');
    }
  }
}
