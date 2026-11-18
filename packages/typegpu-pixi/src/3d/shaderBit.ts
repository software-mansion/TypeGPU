import type { ShaderBit } from '@pixi/3d';
import { tgpu, type d, type TgpuVar } from 'typegpu';
import {
  generateModule,
  type GeneratedModule,
  type ShaderLanguage,
  toIdentifier,
} from '../internal/codegen.ts';
import { capitalize, type ShaderTarget, withShaderTarget } from '../internal/context.ts';
import { type PixiUniforms, toPixiType, type UniformRecord } from '../uniforms.ts';
import { PixiBuiltin, type ShaderStage } from './builtins.ts';

/**
 * A `'use gpu'` function that fills one slot of a material's shader.
 * It takes and returns nothing: it reads and changes the shader's values
 * through `vertex`, `fragment`, `time`, `cameraPosition` and its uniforms.
 */
export type SlotFunction = () => void;

/** The vertex slots of PixiJS 3D's material shader; a custom template can have others */
export interface VertexSlots {
  /** Runs before the mesh's transform. Change `vertex.position`, `vertex.normal` or `vertex.uv` here. */
  beforeTransform?: SlotFunction;
  /** Runs after the mesh's transform. Change `vertex.worldPosition` or `vertex.clipPosition` here. */
  afterTransform?: SlotFunction;
  /** Runs last in the vertex stage */
  end?: SlotFunction;
  [slot: string]: SlotFunction | undefined;
}

/** The fragment slots of PixiJS 3D's material shader; a custom template can have others */
export interface FragmentSlots {
  /** Runs before lighting. Change `fragment.albedo`, `fragment.alpha` or `fragment.normal` here. */
  material?: SlotFunction;
  /** Runs after lighting, before fog and tone mapping. Change `fragment.finalColor` here. */
  end?: SlotFunction;
  [slot: string]: SlotFunction | undefined;
}

export interface ShaderBitOptions {
  /**
   * A unique name. PixiJS caches shaders by the names of their bits, and it's also
   * put in front of the names of the generated functions.
   */
  name: string;
  /**
   * The bit's own values, from `uniforms()`. Each field becomes a per-material value,
   * set with `uniforms.write(material, ...)` or through `material.data`.
   */
  uniforms?: PixiUniforms<UniformRecord> | undefined;
  /** Functions to run in the vertex stage, keyed by the slot they fill */
  vertex?: VertexSlots | undefined;
  /** Functions to run in the fragment stage, keyed by the slot they fill */
  fragment?: FragmentSlots | undefined;
  /**
   * Which renderers to generate code for. A bit without code for a renderer does nothing on it.
   * @default 'both'
   */
  backend?: 'both' | 'gpu' | 'gl' | undefined;
  /** Other bits whose code this one needs, as in a hand-written bit */
  requires?: ShaderBit[] | undefined;
}

// Material fields are members of a local `material` struct, which helper
// functions can't see, so they reach TypeGPU's functions through variables.
interface Bridge {
  readonly variable: TgpuVar<'private', d.AnyWgslData>;
  readonly expression: { readonly gpu: string; readonly gl: string };
  readonly writable: boolean;
}

const uniformBridges = new WeakMap<PixiUniforms<UniformRecord>, Map<string, Bridge>>();

function uniformBridge(uniforms: PixiUniforms<UniformRecord>, key: string): Bridge {
  let bridges = uniformBridges.get(uniforms);
  if (!bridges) {
    bridges = new Map();
    uniformBridges.set(uniforms, bridges);
  }

  let bridge = bridges.get(key);
  if (!bridge) {
    bridge = {
      variable: tgpu.privateVar(uniforms.schema[key] as d.AnyWgslData).$name(key),
      expression: { gpu: `material.${key}`, gl: `material.${key}` },
      writable: false,
    };
    bridges.set(key, bridge);
  }
  return bridge;
}

class BitTarget implements ShaderTarget {
  readonly label: string;
  readonly used = new Set<Bridge>();
  readonly #uniforms: PixiUniforms<UniformRecord> | undefined;
  readonly #stage: ShaderStage | undefined;

  /** @param stage The stage of the slot being generated, when only one slot is */
  constructor(
    label: string,
    uniforms: PixiUniforms<UniformRecord> | undefined,
    stage?: ShaderStage,
  ) {
    this.label = label;
    this.#uniforms = uniforms;
    this.#stage = stage;
  }

  uniformField(uniforms: PixiUniforms<UniformRecord>, key: string): unknown {
    if (uniforms !== this.#uniforms) {
      throw new Error(
        `[@typegpu/pixi] ${capitalize(this.label)} reads the uniform '${key}', which isn't one of its own. Pass the uniforms it reads as its \`uniforms\`.`,
      );
    }
    const bridge = uniformBridge(uniforms, key);
    this.used.add(bridge);
    return bridge.variable.$;
  }

  builtin(builtin: PixiBuiltin<d.AnyWgslData>): unknown {
    if (this.#stage && builtin.stage && builtin.stage !== this.#stage) {
      throw new Error(
        `[@typegpu/pixi] \`${builtin.label}\` only exists in the ${builtin.stage} stage, but ${this.label} reads it in a ${this.#stage} slot.`,
      );
    }
    this.used.add(builtin);
    return builtin.variable.$;
  }
}

interface Slot {
  readonly stage: ShaderStage;
  readonly name: string;
  readonly fn: SlotFunction;
  /** What the function reads or changes, itself or through the functions it calls */
  readonly used: Bridge[];
}

/**
 * The code PixiJS pastes into a slot. A slot's code shares one function with
 * the material's own, so it's wrapped in a block.
 */
function slotCode(slot: Slot, module: GeneratedModule, language: ShaderLanguage): string {
  const platform = language === 'wgsl' ? 'gpu' : 'gl';
  const lines = slot.used.map(
    (bridge) => `${module.idOf(bridge.variable)} = ${bridge.expression[platform]};`,
  );
  lines.push(`${module.idOf(slot.fn)}();`);
  for (const bridge of slot.used) {
    if (bridge.writable) {
      lines.push(`${bridge.expression[platform]} = ${module.idOf(bridge.variable)};`);
    }
  }
  return `{\n${lines.map((line) => `  ${line}`).join('\n')}\n}`;
}

/**
 * Creates a PixiJS 3D shader bit from TypeGPU functions.
 *
 * The result is a plain `ShaderBit`, holding WGSL for PixiJS's WebGPU renderer
 * and GLSL for its WebGL renderer, both generated from the same functions.
 * Pass it to a material's `extraBits`, or to a `BaseMaterial3D`'s `descriptor`.
 *
 * @example
 * ```ts
 * import { Material3D } from '@pixi/3d';
 * import * as p3d from '@typegpu/pixi/3d';
 * import { d, std } from 'typegpu';
 *
 * const contourUniforms = p3d.uniforms({ lowColor: d.vec3f, highColor: d.vec3f, frequency: d.f32 });
 *
 * const contourBit = p3d.shaderBit({
 *   name: 'contour',
 *   uniforms: contourUniforms,
 *   fragment: {
 *     material: () => {
 *       'use gpu';
 *       const u = contourUniforms.$;
 *       const wave = std.sin(p3d.fragment.worldPosition.$.y * u.frequency - p3d.time.$ * 2);
 *       p3d.fragment.albedo.$ *= std.mix(u.lowColor, u.highColor, std.step(0, wave));
 *     },
 *   },
 * });
 *
 * const ground = new Material3D({ roughness: 0.6, extraBits: [contourBit] });
 * contourUniforms.write(ground, { lowColor: d.vec3f(0.03, 0.2, 0.03), highColor: d.vec3f(1), frequency: 4 });
 * ```
 */
export function shaderBit(options: ShaderBitOptions): ShaderBit {
  const { name, backend = 'both' } = options;
  const uniforms = options.uniforms;
  const label = `the shader bit '${name}'`;
  const prefix = toIdentifier(name);

  const slots: Slot[] = [];
  for (const stage of ['vertex', 'fragment'] as const) {
    for (const [slotName, fn] of Object.entries(options[stage] ?? {})) {
      if (!fn) {
        continue;
      }
      // A dry run in a namespace of its own, since a function that was already
      // generated isn't visited again, and so wouldn't report what it reads.
      const target = new BitTarget(label, uniforms, stage);
      withShaderTarget(target, () => tgpu.resolve([fn]));
      slots.push({ stage, name: slotName, fn, used: [...target.used] });
    }
  }

  const bit: ShaderBit = { name };

  if (uniforms) {
    const fields = uniforms.pixiTypes;
    for (const [key, schema] of Object.entries(uniforms.schema)) {
      // The types a PixiJS 3D material can hold
      if (!/^(f32|i32|u32|vec[234]f|mat2x2f)$/.test(schema.type)) {
        throw new Error(
          `[@typegpu/pixi] The uniform '${key}' of ${label} is a ${schema.type}, but a material's values can only be f32, i32, u32, vec2f, vec3f, vec4f or mat2x2f.`,
        );
      }
      toPixiType(schema);
    }
    bit.bindings = { material: fields };
  }

  if (options.requires) {
    bit.requires = options.requires;
  }

  const generate = (language: ShaderLanguage, stageSlots: Slot[]) =>
    generateModule({
      language,
      items: stageSlots.map((slot) => slot.fn),
      prefix,
      target: new BitTarget(label, uniforms),
    });

  const slotsOf = (stage: ShaderStage) => slots.filter((slot) => slot.stage === stage);

  if (backend !== 'gl' && slots.length > 0) {
    // One WGSL module holds both stages, so they share their helpers
    const module = generate('wgsl', slots);
    const gpu: NonNullable<ShaderBit['gpu']> = { header: module.header };

    for (const stage of ['vertex', 'fragment'] as const) {
      const stageSlots = slotsOf(stage);
      if (stageSlots.length > 0) {
        gpu[stage] = Object.fromEntries(
          stageSlots.map((slot) => [slot.name, slotCode(slot, module, 'wgsl')]),
        );
      }
    }
    bit.gpu = gpu;
  }

  if (backend !== 'gpu' && slots.length > 0) {
    const gl: NonNullable<ShaderBit['gl']> = {};

    // Each GLSL stage is a shader of its own. The helpers go in the stage's own header,
    // because a function that only compiles in a fragment shader would break the vertex one.
    for (const stage of ['vertex', 'fragment'] as const) {
      const stageSlots = slotsOf(stage);
      if (stageSlots.length > 0) {
        const module = generate('glsl', stageSlots);
        gl[stage] = {
          header: module.header,
          ...Object.fromEntries(
            stageSlots.map((slot) => [slot.name, slotCode(slot, module, 'glsl')]),
          ),
        };
      }
    }
    bit.gl = gl;
  }

  return bit;
}
