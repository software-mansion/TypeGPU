import { type EffectFragment, PostEffect, type PostEffectOptions } from '@pixi/3d';
import type { UniformGroup } from 'pixi.js';
import { tgpu, d } from 'typegpu';
import { generateModule, rawExpression, type ShaderLanguage } from '../internal/codegen.ts';
import { getShaderTarget, type ShaderTarget } from '../internal/context.ts';
import {
  type PixiUniforms,
  registerUniformGroup,
  type UniformInput,
  type UniformRecord,
} from '../uniforms.ts';
import type { PixiBuiltin } from './builtins.ts';

/** A `'use gpu'` function that returns the colour of the pixel at `uv` */
export type EffectFunction = (uv: d.v2f) => d.v4f;

class EffectTarget implements ShaderTarget {
  readonly label = 'a post effect';
  readonly #language: ShaderLanguage;
  readonly #uniforms: PixiUniforms<UniformRecord> | undefined;

  constructor(language: ShaderLanguage, uniforms: PixiUniforms<UniformRecord> | undefined) {
    this.#language = language;
    this.#uniforms = uniforms;
  }

  uniformField(uniforms: PixiUniforms<UniformRecord>, key: string): unknown {
    if (uniforms !== this.#uniforms) {
      throw new Error(
        `[@typegpu/pixi] A post effect reads the uniform '${key}', which isn't one of its own. Pass the uniforms it reads as its \`uniforms\`.`,
      );
    }
    // PixiJS 3D puts an effect's uniforms in the `fx` group, which GLSL flattens
    return rawExpression(
      this.#language === 'wgsl' ? `fx.${key}` : key,
      uniforms.schema[key] as d.AnyWgslData,
    );
  }

  builtin(builtin: PixiBuiltin<d.AnyWgslData>): unknown {
    if (builtin.stage) {
      throw new Error(
        `[@typegpu/pixi] \`${builtin.label}\` is a value of a material's shader, so a post effect can't read it.`,
      );
    }
    return rawExpression(
      builtin.expression[this.#language === 'wgsl' ? 'gpu' : 'gl'],
      builtin.dataType,
    );
  }

  raw(expression: string, dataType: d.AnyWgslData): unknown {
    return rawExpression(expression, dataType);
  }
}

/** A call to one of the functions PixiJS 3D declares for post effects */
function effectHelperCall<T extends d.AnyWgslData>(call: string, dataType: T) {
  return {
    get $(): d.InferGPU<T> {
      const name = call.slice(0, call.indexOf('('));
      const target = getShaderTarget(`\`${name}()\``);
      if (!target.raw) {
        throw new Error(
          `[@typegpu/pixi] \`${name}()\` only exists in post effects, so it can't be called in ${target.label}.`,
        );
      }
      return target.raw(call, dataType) as d.InferGPU<T>;
    },
  };
}

// The parameter names below appear in the calls as-is, so they're
// spelled in a way that nothing else in a shader will be.

const sampleColorCall = effectHelperCall('sampleColor(_pixiUv)', d.vec4f);
/** Reads the picture so far at `uv`: the scene, or the result of the step before */
export const sampleColor = tgpu
  .fn(
    [d.vec2f],
    d.vec4f,
  )((_pixiUv) => {
    'use gpu';
    return sampleColorCall.$;
  })
  .$name('sampleColor');

const sampleColorLodCall = effectHelperCall('sampleColorLod(_pixiUv, _pixiLod)', d.vec4f);
/** Reads the picture so far at a mip level. The effect's input needs mips (`inputMips`). */
export const sampleColorLod = tgpu
  .fn(
    [d.vec2f, d.f32],
    d.vec4f,
  )((_pixiUv, _pixiLod) => {
    'use gpu';
    return sampleColorLodCall.$;
  })
  .$name('sampleColorLod');

const sampleColor2Call = effectHelperCall('sampleColor2(_pixiUv)', d.vec4f);
/** Reads the second colour input of a `FullscreenPass`, its `reads.color2` */
export const sampleColor2 = tgpu
  .fn(
    [d.vec2f],
    d.vec4f,
  )((_pixiUv) => {
    'use gpu';
    return sampleColor2Call.$;
  })
  .$name('sampleColor2');

const sampleDepthCall = effectHelperCall('sampleDepth(_pixiUv)', d.f32);
/** Reads the scene's raw depth at `uv` */
export const sampleDepth = tgpu
  .fn(
    [d.vec2f],
    d.f32,
  )((_pixiUv) => {
    'use gpu';
    return sampleDepthCall.$;
  })
  .$name('sampleDepth');

const viewPosCall = effectHelperCall('viewPos(_pixiUv)', d.vec3f);
/** The view-space position of the surface at `uv`, under a perspective camera */
export const viewPos = tgpu
  .fn(
    [d.vec2f],
    d.vec3f,
  )((_pixiUv) => {
    'use gpu';
    return viewPosCall.$;
  })
  .$name('viewPos');

const linearDepthCall = effectHelperCall('linearDepth(_pixiDepth)', d.f32);
/** Converts a raw depth value to a distance from the camera, under a perspective camera */
export const linearDepth = tgpu
  .fn(
    [d.f32],
    d.f32,
  )((_pixiDepth) => {
    'use gpu';
    return linearDepthCall.$;
  })
  .$name('linearDepth');

const texelCall = effectHelperCall('texel()', d.vec2f);
/** The size of one pixel of the pass's target, as a step in `uv` */
export const texel = tgpu
  .fn(
    [],
    d.vec2f,
  )(() => {
    'use gpu';
    return texelCall.$;
  })
  .$name('texel');

const inputTexelCall = effectHelperCall('inputTexel()', d.vec2f);
/** The size of one pixel of the colour input, as a step in `uv` */
export const inputTexel = tgpu
  .fn(
    [],
    d.vec2f,
  )(() => {
    'use gpu';
    return inputTexelCall.$;
  })
  .$name('inputTexel');

const viewTexelCall = effectHelperCall('viewTexel()', d.vec2f);
/** The size of one physical pixel of the view, as a step in `uv` */
export const viewTexel = tgpu
  .fn(
    [],
    d.vec2f,
  )(() => {
    'use gpu';
    return viewTexelCall.$;
  })
  .$name('viewTexel');

const depthTexelCall = effectHelperCall('depthTexel()', d.vec2f);
/** The size of one pixel of the scene's depth, as a step in `uv` */
export const depthTexel = tgpu
  .fn(
    [],
    d.vec2f,
  )(() => {
    'use gpu';
    return depthTexelCall.$;
  })
  .$name('depthTexel');

export interface EffectFragmentOptions {
  /** The function run for every pixel of the picture */
  effect: EffectFunction;
  /** The effect's settings, from `uniforms()` */
  uniforms?: PixiUniforms<UniformRecord> | undefined;
}

/**
 * Generates the shader of a PixiJS 3D post effect from a TypeGPU function,
 * in WGSL for PixiJS's WebGPU renderer and in GLSL for its WebGL renderer.
 *
 * The result goes wherever PixiJS 3D takes an `EffectFragment`: a `PostEffect`
 * subclass's `fragment`, or a `FullscreenPass` of an effect with several steps.
 * For an effect with one step, `postEffect` does the rest too.
 *
 * @example
 * ```ts
 * const blurUniforms = p3d.uniforms({ direction: d.vec2f });
 *
 * const blurFragment = p3d.effectFragment({
 *   uniforms: blurUniforms,
 *   effect: (uv) => {
 *     'use gpu';
 *     const step = blurUniforms.$.direction * p3d.inputTexel();
 *     return (p3d.sampleColor(uv - step) + p3d.sampleColor(uv) + p3d.sampleColor(uv + step)) / 3;
 *   },
 * });
 *
 * new FullscreenPass({
 *   renderer: io.renderer,
 *   fragment: blurFragment,
 *   uniforms: blurUniforms.createGroup({ direction: [1, 0] }),
 *   reads: { color: io.input },
 *   writes: io.output,
 * });
 * ```
 */
export function effectFragment(options: EffectFragmentOptions): EffectFragment {
  const uniforms = options.uniforms;
  const effect = options.effect;

  // A shell gives the function the signature PixiJS 3D calls, whatever `effect` is
  const entry = tgpu.fn(
    [d.vec2f],
    d.vec4f,
  )((uv) => {
    'use gpu';
    return effect(uv);
  });

  const generate = (language: ShaderLanguage) =>
    generateModule({
      language,
      items: [entry],
      prefix: 'tgpu',
      fixedNames: new Map([[entry, 'effect']]),
      target: new EffectTarget(language, uniforms),
    }).header;

  return { gpu: generate('wgsl'), gl: generate('glsl') };
}

export type TgpuPostEffectOptions<T extends UniformRecord> = PostEffectOptions & {
  /** The values the effect's uniforms start with. The ones left out start at zero. */
  uniforms?: UniformInput<T>;
};

export interface PostEffectDefinition<T extends UniformRecord> extends EffectFragmentOptions {
  uniforms?: PixiUniforms<T> | undefined;
  /**
   * Whether the effect reads the scene as light, or the picture as the screen shows it.
   * One instance can still pick its own.
   * @default 'beforeToneMapping'
   */
  stage?: PostEffectOptions['stage'];
  /** Whether the effect's input needs mips, for `sampleColorLod` */
  inputMips?: boolean | undefined;
}

/**
 * Creates a PixiJS 3D post effect class from a TypeGPU function.
 *
 * Instances go in a view's `passes`. Change an instance's uniforms with
 * `uniforms.write(effect, ...)`.
 *
 * @example
 * ```ts
 * const vignetteUniforms = p3d.uniforms({ strength: d.f32 });
 *
 * const VignetteEffect = p3d.postEffect({
 *   stage: 'afterToneMapping',
 *   uniforms: vignetteUniforms,
 *   effect: (uv) => {
 *     'use gpu';
 *     const color = p3d.sampleColor(uv);
 *     const edge = std.smoothstep(0.3, 0.8, std.distance(uv, d.vec2f(0.5)));
 *     return d.vec4f(color.rgb * (1 - edge * vignetteUniforms.$.strength), color.a);
 *   },
 * });
 *
 * const vignette = new VignetteEffect({ uniforms: { strength: 0.6 } });
 * view3d.passes = [vignette];
 *
 * vignetteUniforms.write(vignette, { strength: 0.3 });
 * ```
 */
export function postEffect<T extends UniformRecord = Record<string, never>>(
  definition: PostEffectDefinition<T>,
): new (options?: TgpuPostEffectOptions<T>) => PostEffect {
  const fragment = effectFragment(definition);
  const uniforms = definition.uniforms;

  return class TgpuPostEffect extends PostEffect {
    override readonly inputMips = definition.inputMips ?? false;
    protected override readonly fragment = fragment;
    protected override readonly uniforms: UniformGroup | null;

    constructor(options: TgpuPostEffectOptions<T> = {}) {
      const { uniforms: initial, ...pixiOptions } = options;
      super(definition.stage ? { stage: definition.stage, ...pixiOptions } : pixiOptions);

      this.uniforms = uniforms ? uniforms.createGroup(initial) : null;
      if (uniforms && this.uniforms) {
        registerUniformGroup(
          this,
          uniforms as unknown as PixiUniforms<UniformRecord>,
          this.uniforms,
        );
      }
    }
  };
}
