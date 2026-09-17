import {
  tgpu,
  common,
  d,
  std,
  type SampledFlag,
  type RenderFlag,
  type TgpuCommandEncoder,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuBindGroup,
} from 'typegpu';
import {
  loadPixel,
  type PostprocessPass,
  type Size,
  type StandalonePass,
  type TextureTransform,
} from './passes.ts';

export type StackInput = (TgpuTexture & SampledFlag) | { texture: GPUExternalTexture; size: Size };
export interface InstantiateOptions {
  root: TgpuRoot;
  input: StackInput;
  /** Intermediate texture format. Final format is taken from the render destination. */
  format?: 'rgba16float' | 'rgba32float' | 'rgba8unorm' | 'bgra8unorm';
}
export interface RenderOptions {
  output: TgpuTexture & RenderFlag;
  encoder?: TgpuCommandEncoder;
}

function renderView(texture: TgpuTexture & RenderFlag) {
  return texture.createView('render');
}

function checkSize(size: Size): [number, number] {
  if (size.length !== 2 || size.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
    throw new Error('Postprocess dimensions must be positive integers.');
  }
  return [size[0], size[1]];
}
function textureSize(texture: TgpuTexture): [number, number] {
  if (
    (texture.props.dimension ?? '2d') !== '2d' ||
    (texture.props.sampleCount ?? 1) !== 1 ||
    (texture.props.size[2] ?? 1) !== 1
  ) {
    throw new Error('Postprocess textures must be single-sampled 2D textures.');
  }
  if (/uint|sint|depth|stencil/.test(texture.props.format)) {
    throw new Error('Postprocess textures must have a float-sampled color format.');
  }
  return checkSize([texture.props.size[0], texture.props.size[1] ?? 1]);
}
function inputSize(input: StackInput): Size {
  return 'texture' in input ? checkSize(input.size) : textureSize(input);
}
function sameSize(a: Size, b: Size) {
  return a[0] === b[0] && a[1] === b[1];
}

function fuse(passes: readonly PostprocessPass[]): StandalonePass[] {
  const groups: StandalonePass[] = [];
  const flattened = passes.flatMap((pass) => (pass.kind === 'group' ? pass.passes : [pass]));
  for (const [index, pass] of flattened.entries()) {
    if (pass.kind === 'standalone') {
      if (pass.size === 'adapt' && index !== flattened.length - 1) {
        throw new Error("An 'adapt' pass must be the last pass in the stack.");
      }
      groups.push({ ...pass });
    } else {
      const previous = groups.pop();
      const before: TextureTransform = previous?.callback ?? loadPixel;
      const after = pass.callback;
      groups.push({
        ...previous,
        kind: 'standalone',
        callback: (input, uv) => {
          'use gpu';
          return after(before(input, uv));
        },
      });
    }
  }
  return groups.length ? groups : [{ kind: 'standalone', callback: loadPixel }];
}

export function createStackLayout(passes: readonly PostprocessPass[]) {
  const groups = fuse(passes);
  return {
    /** Render stages after fusion, excluding the optional external-texture import. */
    passCount: groups.length,
    instantiate({ root, input: initialInput, format = 'rgba16float' }: InstantiateOptions) {
      const sizePlan = (input: StackInput) => {
        let size = inputSize(input);
        return groups.map((group) => {
          if (group.size === 'adapt') {
            return 'adapt' as const;
          }
          size = checkSize(
            typeof group.size === 'function' ? group.size(size) : (group.size ?? size),
          );
          return size;
        });
      };
      const snapshotInput = (value: StackInput): StackInput =>
        'texture' in value
          ? Object.freeze({ texture: value.texture, size: Object.freeze(checkSize(value.size)) })
          : value;
      let input = snapshotInput(initialInput);
      let sizes = sizePlan(input);
      let destroyed = false;
      const assertLive = () => {
        if (destroyed) {
          throw new Error('Postprocess stack has been destroyed.');
        }
      };
      const stages = groups.map((group) => {
        const layout = tgpu.bindGroupLayout({
          input: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
        });
        const callback = group.callback;
        const fragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
          'use gpu';
          return callback(layout.$.input, uv);
        });
        const makePipeline = (targetFormat: GPUTextureFormat) =>
          root.createRenderPipeline({
            vertex: common.fullScreenTriangle,
            fragment,
            targets: { format: targetFormat },
          });
        const pipelines = new Map<GPUTextureFormat, ReturnType<typeof makePipeline>>();
        const bindings = new WeakMap<TgpuTexture, TgpuBindGroup>();
        return { layout, makePipeline, pipelines, bindings };
      });
      type Intermediate = TgpuTexture & SampledFlag & RenderFlag;
      const intermediates = new Map<number, Intermediate>();
      // The external conversion keeps custom passes' texture_2d input contract unchanged.
      const externalLayout = tgpu.bindGroupLayout({
        input: { externalTexture: d.textureExternal() },
      });
      const externalFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
        'use gpu';
        const size = d.vec2i(std.textureDimensions(externalLayout.$.input));
        const pixel = std.clamp(d.vec2i(uv * d.vec2f(size)), d.vec2i(0), size - 1);
        return std.textureLoad(externalLayout.$.input, pixel);
      });
      let externalPipeline: ReturnType<(typeof stages)[number]['makePipeline']> | undefined;
      const getIntermediate = (index: number, size: Size) => {
        const existing = intermediates.get(index);
        if (existing && sameSize(textureSize(existing), size)) {
          return existing;
        }
        const texture = root
          .createTexture({ size: checkSize(size), format })
          .$usage('sampled', 'render');
        intermediates.set(index, texture);
        existing?.destroy();
        return texture;
      };
      // Cache render views separately; repeated renders must not allocate views.
      const attachmentViews = new WeakMap<
        TgpuTexture & RenderFlag,
        ReturnType<typeof renderView>
      >();
      const attachment = (texture: TgpuTexture & RenderFlag) => {
        let view = attachmentViews.get(texture);
        if (!view) {
          view = renderView(texture);
          attachmentViews.set(texture, view);
        }
        return view;
      };
      return {
        get input() {
          return input;
        },
        set input(value: StackInput) {
          assertLive();
          const nextInput = snapshotInput(value);
          const nextSizes = sizePlan(nextInput);
          input = nextInput;
          sizes = nextSizes;
        },
        /** 'adapt' means the final resampler accepts the caller's output dimensions. */
        get outputSize(): Size | 'adapt' {
          const last = sizes.at(-1);
          return last === 'adapt' ? last : checkSize(last ?? inputSize(input));
        },
        get passCount() {
          return stages.length + ('texture' in input ? 1 : 0);
        },
        render({ output, encoder }: RenderOptions) {
          assertLive();
          const targetSize = textureSize(output);
          const expected = sizes.at(-1);
          if (expected !== 'adapt' && expected && !sameSize(expected, targetSize)) {
            throw new Error(
              `Postprocess output size must be ${expected.join(' × ')}, got ${targetSize.join(' × ')}.`,
            );
          }
          if (!('texture' in input) && root.unwrap(input) === root.unwrap(output)) {
            throw new Error('Postprocess input and output must be distinct textures.');
          }
          const commands = encoder ?? root['~unstable'].createCommandEncoder();
          let source: TgpuTexture & SampledFlag;
          if ('texture' in input) {
            const imported = getIntermediate(-1, inputSize(input));
            source = imported;
            externalPipeline ??= root.createRenderPipeline({
              vertex: common.fullScreenTriangle,
              fragment: externalFragment,
              targets: { format },
            });
            externalPipeline
              .with(root.createBindGroup(externalLayout, { input: input.texture }))
              .with(commands)
              .withColorAttachment({ view: attachment(imported) })
              .draw(3);
          } else {
            source = input;
            intermediates.get(-1)?.destroy();
            intermediates.delete(-1);
          }
          for (const [index, stage] of stages.entries()) {
            const size = sizes[index];
            const intermediate =
              index === stages.length - 1
                ? undefined
                : getIntermediate(index, size === 'adapt' || !size ? targetSize : size);
            const destination = intermediate ?? output;
            let pipeline = stage.pipelines.get(destination.props.format);
            if (!pipeline) {
              pipeline = stage.makePipeline(destination.props.format);
              stage.pipelines.set(destination.props.format, pipeline);
            }
            let binding = stage.bindings.get(source);
            if (!binding) {
              binding = root.createBindGroup(stage.layout, { input: source });
              stage.bindings.set(source, binding);
            }
            pipeline
              .with(binding)
              .with(commands)
              .withColorAttachment({ view: attachment(destination) })
              .draw(3);
            // Only intermediate destinations become sources of subsequent stages.
            if (intermediate) {
              source = intermediate;
            }
          }
          if (!encoder) {
            commands.submit();
          }
        },
        destroy() {
          if (destroyed) {
            return;
          }
          destroyed = true;
          for (const texture of intermediates.values()) {
            texture.destroy();
          }
          intermediates.clear();
        },
      };
    },
  };
}
export type PostprocessStackLayout = ReturnType<typeof createStackLayout>;
export type PostprocessStack = ReturnType<PostprocessStackLayout['instantiate']>;
