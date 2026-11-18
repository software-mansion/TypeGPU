import { tgpu, d, type TgpuVar } from 'typegpu';
import { getShaderTarget, type PixiBuiltinLike } from '../internal/context.ts';

export type ShaderStage = 'vertex' | 'fragment';

/**
 * A value PixiJS 3D declares in a material's shader, such as the surface colour.
 * @internal
 */
export class PixiBuiltin<T extends d.AnyWgslData> implements PixiBuiltinLike {
  readonly label: string;
  readonly dataType: T;
  /** What the value is called in PixiJS's WGSL and GLSL */
  readonly expression: { readonly gpu: string; readonly gl: string };
  /** The stage whose slots declare it, or `undefined` for a global that every function can read */
  readonly stage: ShaderStage | undefined;
  readonly writable: boolean;
  /** Carries the value between PixiJS's shader and TypeGPU's functions */
  readonly variable: TgpuVar<'private', T>;

  constructor(options: {
    label: string;
    dataType: T;
    gpu: string;
    gl?: string;
    stage?: ShaderStage;
    writable?: boolean;
  }) {
    this.label = options.label;
    this.dataType = options.dataType;
    this.expression = { gpu: options.gpu, gl: options.gl ?? options.gpu };
    this.stage = options.stage;
    this.writable = options.writable ?? false;
    this.variable = tgpu.privateVar(options.dataType).$name(options.label.replaceAll('.', '_'));
  }

  get $(): d.InferGPU<T> {
    const target = getShaderTarget(`\`${this.label}.$\``);
    if (!target.builtin) {
      throw new Error(
        `[@typegpu/pixi] \`${this.label}\` is a value of a PixiJS 3D material's shader, so it can't be read in ${target.label}.`,
      );
    }
    return target.builtin(this) as d.InferGPU<T>;
  }

  set $(_value: d.InferGPU<T>) {
    throw new Error(
      `[@typegpu/pixi] \`${this.label}\` can only be written inside a 'use gpu' function of a shader bit.`,
    );
  }
}

/** A value of a PixiJS 3D shader that a `'use gpu'` function can read */
export interface ShaderInput<T extends d.AnyWgslData> {
  readonly $: d.InferGPU<T>;
}

/** A value of a PixiJS 3D shader that a `'use gpu'` function can read and change */
export interface ShaderVariable<T extends d.AnyWgslData> {
  $: d.InferGPU<T>;
}

function input<T extends d.AnyWgslData>(
  options: ConstructorParameters<typeof PixiBuiltin<T>>[0],
): ShaderInput<T> {
  return new PixiBuiltin(options);
}

function variable<T extends d.AnyWgslData>(
  options: ConstructorParameters<typeof PixiBuiltin<T>>[0],
): ShaderVariable<T> {
  return new PixiBuiltin({ ...options, writable: true });
}

/**
 * Seconds since the page loaded.
 * Readable in every shader bit and post effect.
 */
export const time: ShaderInput<d.F32> = input({
  label: 'time',
  dataType: d.f32,
  gpu: 'global.uTime',
  gl: 'uTime',
});

/**
 * The camera's position in world space.
 * Readable in every shader bit and post effect.
 */
export const cameraPosition: ShaderInput<d.Vec3f> = input({
  label: 'cameraPosition',
  dataType: d.vec3f,
  gpu: 'camera.uCameraPosition',
  gl: 'uCameraPosition',
});

/**
 * The values a shader bit's vertex functions can read and change.
 *
 * `position`, `normal` and `uv` are for the `beforeTransform` slot, and are in the mesh's own space.
 * `worldPosition`, `worldNormal` and `clipPosition` are for the `afterTransform` and `end` slots.
 */
export const vertex = {
  /** The vertex position in the mesh's own space, with `w` set to 1 */
  position: variable({
    label: 'vertex.position',
    dataType: d.vec4f,
    gpu: 'position',
    stage: 'vertex',
  }),
  /** The vertex normal in the mesh's own space */
  normal: variable({ label: 'vertex.normal', dataType: d.vec3f, gpu: 'normal', stage: 'vertex' }),
  /** The texture coordinates passed on to the fragment stage */
  uv: variable({ label: 'vertex.uv', dataType: d.vec2f, gpu: 'uv', stage: 'vertex' }),
  /**
   * The vertex position in world space, from `afterTransform` on.
   * Moving it means setting `clipPosition` again as well.
   */
  worldPosition: variable({
    label: 'vertex.worldPosition',
    dataType: d.vec4f,
    gpu: 'worldPosition',
    stage: 'vertex',
  }),
  /** The vertex normal in world space, from `afterTransform` on */
  worldNormal: variable({
    label: 'vertex.worldNormal',
    dataType: d.vec3f,
    gpu: 'worldNormal',
    stage: 'vertex',
  }),
  /** The vertex position in clip space, from `afterTransform` on */
  clipPosition: variable({
    label: 'vertex.clipPosition',
    dataType: d.vec4f,
    gpu: 'clipPosition',
    gl: 'gl_Position',
    stage: 'vertex',
  }),
} as const;

/**
 * The values a shader bit's fragment functions can read and change.
 *
 * `albedo`, `alpha` and `normal` are for the `material` slot, which runs before lighting.
 * `finalColor` is for the `end` slot, which runs after it. `emissive`, `roughness`,
 * `metallic` and `occlusion` only exist on materials that declare them, as `Material3D` does.
 */
export const fragment = {
  /** The surface position in world space */
  worldPosition: input({
    label: 'fragment.worldPosition',
    dataType: d.vec3f,
    gpu: 'input.vPosition',
    gl: 'vPosition',
    stage: 'fragment',
  }),
  /** The mesh's texture coordinates */
  uv: input({
    label: 'fragment.uv',
    dataType: d.vec2f,
    gpu: 'input.vUV',
    gl: 'vUV',
    stage: 'fragment',
  }),
  /** The surface normal in world space */
  normal: variable({
    label: 'fragment.normal',
    dataType: d.vec3f,
    gpu: 'normal',
    stage: 'fragment',
  }),
  /** The surface colour before lighting. Lit materials work in linear light. */
  albedo: variable({
    label: 'fragment.albedo',
    dataType: d.vec3f,
    gpu: 'albedo',
    stage: 'fragment',
  }),
  /** The surface opacity. An `'opaque'` material sets it back to 1 afterwards. */
  alpha: variable({ label: 'fragment.alpha', dataType: d.f32, gpu: 'alpha', stage: 'fragment' }),
  /** The light the surface gives off. On `Material3D` and `PhongMaterial`. */
  emissive: variable({
    label: 'fragment.emissive',
    dataType: d.vec3f,
    gpu: 'emissive',
    stage: 'fragment',
  }),
  /** On `Material3D` */
  roughness: variable({
    label: 'fragment.roughness',
    dataType: d.f32,
    gpu: 'roughness',
    stage: 'fragment',
  }),
  /** On `Material3D` */
  metallic: variable({
    label: 'fragment.metallic',
    dataType: d.f32,
    gpu: 'metallic',
    stage: 'fragment',
  }),
  /** On `Material3D` */
  occlusion: variable({
    label: 'fragment.occlusion',
    dataType: d.f32,
    gpu: 'occlusion',
    stage: 'fragment',
  }),
  /** The lit colour, in the `end` slot: after lighting, before fog and tone mapping */
  finalColor: variable({
    label: 'fragment.finalColor',
    dataType: d.vec3f,
    gpu: 'finalColor',
    stage: 'fragment',
  }),
} as const;
