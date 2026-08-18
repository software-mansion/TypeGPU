import { common, d, std, tgpu } from 'typegpu';
import type { StorageFlag, TgpuBuffer, TgpuRenderPipeline, TgpuRoot, UniformFlag } from 'typegpu';
import { DepthDisparityRangeEstimator } from './disparity-range.ts';

const DisplayParams = d.struct({
  outputSize: d.vec2u,
});

const displayLayout = tgpu.bindGroupLayout({
  params: { uniform: DisplayParams },
  disparity: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  range: { storage: d.vec2f, access: 'readonly' },
});

function mixColor(
  value: number,
  lowerPosition: number,
  upperPosition: number,
  lower: d.v3f,
  upper: d.v3f,
): d.v3f {
  'use gpu';
  const blend = (value - lowerPosition) / (upperPosition - lowerPosition);
  return std.mix(lower, upper, blend);
}

function disparityColor(position: number): d.v3f {
  'use gpu';
  const value = std.clamp(position, d.f32(0), d.f32(1));
  const color0 = d.vec3f(7 / 255, 5 / 255, 31 / 255);
  const color1 = d.vec3f(0, 26 / 255, 114 / 255);
  const color2 = d.vec3f(29 / 255, 114 / 255, 240 / 255);
  const color3 = d.vec3f(138 / 255, 92 / 255, 246 / 255);
  const color4 = d.vec3f(196 / 255, 100 / 255, 255 / 255);
  const color5 = d.vec3f(248 / 255, 247 / 255, 221 / 255);

  if (value <= 0.2) {
    return mixColor(value, d.f32(0), 0.2, color0, color1);
  }
  if (value <= 0.42) {
    return mixColor(value, 0.2, 0.42, color1, color2);
  }
  if (value <= 0.64) {
    return mixColor(value, 0.42, 0.64, color2, color3);
  }
  if (value <= 0.82) {
    return mixColor(value, 0.64, 0.82, color3, color4);
  }
  return mixColor(value, 0.82, d.f32(1), color4, color5);
}

export class DepthDisparityPresenter {
  readonly #root: TgpuRoot;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #params: TgpuBuffer<typeof DisplayParams> & UniformFlag;
  readonly #range: TgpuBuffer<d.Vec2f> & StorageFlag;
  readonly #rangeEstimator: DepthDisparityRangeEstimator;
  readonly #pipeline: TgpuRenderPipeline<d.Vec4f>;
  #outputAlias: (TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag) | undefined;
  #bindGroup: ReturnType<TgpuRoot['createBindGroup']> | undefined;
  #width = 1;
  #height = 1;
  #destroyed = false;

  constructor(root: TgpuRoot, canvas: HTMLCanvasElement) {
    this.#root = root;
    this.#canvas = canvas;
    this.#context = root.configureContext({ canvas, alphaMode: 'opaque' });
    this.#params = root
      .createBuffer(DisplayParams, { outputSize: d.vec2u(this.#width, this.#height) })
      .$usage('uniform');
    this.#range = root.createBuffer(d.vec2f, d.vec2f(0, 64)).$usage('storage');
    this.#rangeEstimator = new DepthDisparityRangeEstimator(root);
    this.#pipeline = root
      .createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          const params = displayLayout.$.params;
          const pixel = d.vec2u(uv * d.vec2f(params.outputSize));
          const x = std.min(pixel.x, params.outputSize.x - 1);
          const y = std.min(pixel.y, params.outputSize.y - 1);
          const disparity = displayLayout.$.disparity[y * params.outputSize.x + x].x;
          if (disparity !== disparity) {
            return d.vec4f(1, 0, 1, 1);
          }
          const normalized =
            (disparity - displayLayout.$.range.x) /
            (displayLayout.$.range.y - displayLayout.$.range.x);
          return d.vec4f(disparityColor(normalized), 1);
        },
        targets: { format: navigator.gpu.getPreferredCanvasFormat() },
      })
      .$name('DepthART disparity presenter');
  }

  async initAsync(): Promise<void> {
    this.#assertAlive();
    await Promise.all([this.#pipeline.initAsync(), this.#rangeEstimator.initAsync()]);
  }

  attach(outputBuffer: GPUBuffer, width: number, height: number): void {
    this.#assertAlive();
    this.#outputAlias?.destroy();
    this.#width = width;
    this.#height = height;
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#canvas.style.aspectRatio = `${width} / ${height}`;
    this.#outputAlias = this.#root
      .createBuffer(d.arrayOf(d.vec4f, width * height), outputBuffer)
      .$usage('storage');
    this.#bindGroup = this.#root.createBindGroup(displayLayout, {
      params: this.#params,
      disparity: this.#outputAlias,
      range: this.#range,
    });
    this.#rangeEstimator.attach(this.#outputAlias, this.#range, width * height);
    this.#writeParams();
  }

  detach(): void {
    this.#rangeEstimator.detach();
    this.#outputAlias?.destroy();
    this.#outputAlias = undefined;
    this.#bindGroup = undefined;
  }

  encode(encoder: GPUCommandEncoder, autoRange = false): void {
    this.#assertAlive();
    if (!this.#bindGroup) {
      throw new Error('No disparity output buffer is attached to the presenter.');
    }
    if (autoRange) {
      this.#rangeEstimator.encode(encoder);
    }
    this.#pipeline
      .with(this.#bindGroup)
      .with(encoder)
      .withColorAttachment({
        view: this.#context,
        clearValue: [11 / 255, 8 / 255, 40 / 255, 1],
      })
      .draw(3);
  }

  clear(): void {
    this.#assertAlive();
    const encoder = this.#root.device.createCommandEncoder({
      label: 'Clear DepthART disparity presentation',
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          clearValue: { r: 11 / 255, g: 8 / 255, b: 40 / 255, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.end();
    this.#root.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.detach();
    this.#rangeEstimator.destroy();
    this.#range.destroy();
    this.#params.destroy();
    this.#context.unconfigure();
  }

  #writeParams(): void {
    this.#params.write({ outputSize: d.vec2u(this.#width, this.#height) });
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('The disparity presenter has been destroyed.');
    }
  }
}
