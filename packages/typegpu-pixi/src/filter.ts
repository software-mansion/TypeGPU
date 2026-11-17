import {
  Filter,
  type FilterOptions,
  GlProgram,
  GpuProgram,
  type Renderer,
  RendererType,
  type UniformGroup,
} from 'pixi.js';
import { dualGlOptions } from '@typegpu/gl';
import {
  tgpu,
  d,
  type AnyAutoCustoms,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuFragmentFn,
  type TgpuRoot,
  type TgpuVertexFn,
} from 'typegpu';
import { capitalize, withShaderTarget } from './internal/context.ts';
import {
  type FilterGlobalValues,
  type FilterShaderTarget,
  filterGlobalsLayout,
  filterVertex,
  GLOBAL_UNIFORM_NAMES,
  GlobalFilterUniforms,
} from './filterGlobals.ts';
import { fixedResourcesOf, type FixedResources, foreignBindGroup } from './internal/resources.ts';
import { getRoot, isWebGPURenderer } from './root.ts';
import {
  type PixiUniforms,
  registerUniformGroup,
  type UniformRecord,
  type UniformSchema,
} from './uniforms.ts';

// ----------
// Public API
// ----------

/** What a filter's vertex stage receives: a corner of PixiJS's filter quad, from 0 to 1 */
export type FilterVertexIn = TgpuVertexFn.AutoIn<{ aPosition: d.v2f }>;

/**
 * What a filter's vertex stage returns: the clip-space `$position` (see `filterVertexPosition`),
 * and any values to pass on to the fragment stage.
 */
export type FilterVertexOut = AnyAutoCustoms & { $position: d.v4f };

/** What the default vertex stage, `filterVertex`, passes on to the fragment stage */
type DefaultVertexOut = { $position: d.v4f; uv: d.v2f };

/** The vertex outputs that reach the fragment stage: all but the builtins */
type Varyings<T> = {
  [K in keyof T as K extends `$${string}` ? never : K]: T[K];
};

/**
 * What a filter's fragment stage receives: what its vertex stage returns, interpolated.
 * Without a custom vertex stage, that's `{ uv }`, the position in the input texture.
 */
export type FilterFragmentIn<TVertexOut = DefaultVertexOut> = TgpuFragmentFn.AutoIn<
  Varyings<TVertexOut> & AnyAutoCustoms
>;

export interface TgpuFilterOptions<
  TVertexOut extends FilterVertexOut = DefaultVertexOut,
> extends FilterOptions {
  /** A name for the shader program, shown by debugging tools */
  name?: string | undefined;
  /**
   * The filter's values, from `uniforms()`. Set them with `uniforms.write(filter, ...)`.
   *
   * Besides these, on PixiJS's WebGPU renderer the filter's shaders can read the buffers,
   * textures and samplers of the TypeGPU root that `getRoot(renderer)` returns.
   */
  uniforms?: PixiUniforms<UniformRecord> | undefined;
  /**
   * A `'use gpu'` function run for each corner of PixiJS's filter quad.
   * It returns `$position` (use `filterVertexPosition`), and everything else it returns is
   * passed on to the fragment stage. When left out, the filter uses `filterVertex`, which
   * passes on `uv`.
   */
  vertex?: ((input: FilterVertexIn) => TVertexOut) | undefined;
  /** A `'use gpu'` function that returns the colour of a pixel of the filter's output */
  fragment: (input: FilterFragmentIn<TVertexOut>) => d.v4f;
}

// --------------
// Implementation
// --------------

type ShaderLanguage = 'wgsl' | 'glsl';

/** The name of the uniform struct at `@group(1) @binding(0)` before TypeGPU renames anything */
const UNIFORMS_ENTRY = 'filterUniforms';

type UniformsLayout = TgpuBindGroupLayout<{
  [UNIFORMS_ENTRY]: { uniform: d.WgslStruct<Record<string, UniformSchema>> };
}>;

const uniformLayouts = new WeakMap<PixiUniforms<UniformRecord>, UniformsLayout>();

/**
 * The bind group layout of a filter's own uniforms: one uniform struct at `@group(1)`,
 * the group PixiJS binds a filter's own resources to.
 */
function uniformsLayoutOf(uniforms: PixiUniforms<UniformRecord>): UniformsLayout {
  let layout = uniformLayouts.get(uniforms);
  if (!layout) {
    layout = tgpu
      .bindGroupLayout({
        [UNIFORMS_ENTRY]: { uniform: d.struct(uniforms.schema).$name('FilterUniforms') },
      })
      .$idx(1);
    uniformLayouts.set(uniforms, layout);
  }
  return layout;
}

const glslTypes: Record<string, string> = {
  f32: 'float',
  i32: 'int',
  u32: 'uint',
  vec2f: 'vec2',
  vec3f: 'vec3',
  vec4f: 'vec4',
  vec2i: 'ivec2',
  vec3i: 'ivec3',
  vec4i: 'ivec4',
  vec2u: 'uvec2',
  vec3u: 'uvec3',
  vec4u: 'uvec4',
  mat2x2f: 'mat2',
  mat3x3f: 'mat3',
  mat4x4f: 'mat4',
};

// Mark where the GLSL holds the whole of `filterGlobals.$.gfu`. Nothing else in the code
// can hold these characters.
const GFU_OPEN = '\uE002';
const GFU_CLOSE = '\uE003';
const GFU_FIELD = new RegExp(`${GFU_OPEN}[^${GFU_CLOSE}]*${GFU_CLOSE}\\.(\\w+)`, 'g');
const GFU_MARKS = new RegExp(`[${GFU_OPEN}${GFU_CLOSE}]`, 'g');

/** `GlobalFilterUniforms(uInputSize, ...).uInputSize` becomes `uInputSize` */
function simplifyGlobals(glsl: string): string {
  return glsl.replace(GFU_FIELD, '$1').replace(GFU_MARKS, '');
}

const IDENTIFIER = /[A-Za-z_]\w*/g;

/**
 * Keeps the declarations that `main` needs, directly or through others.
 *
 * Each GLSL stage is generated from the whole pipeline, so it also holds the functions
 * only the other stage calls, and a function that calls something only one stage has
 * (like `fwidth`, which only exists in fragment shaders) would fail to compile.
 */
function reachableFromMain(declarations: readonly { name?: string | undefined; code: string }[]) {
  const kept = new Set<number>();
  const used = new Set<string>();
  const keep = (index: number, code: string) => {
    kept.add(index);
    for (const [identifier] of code.matchAll(IDENTIFIER)) {
      used.add(identifier);
    }
  };

  // Declarations without a name are the stage's inputs and outputs
  declarations.forEach(({ name, code }, index) => {
    if (code.trim() !== '' && (name === undefined || /^void main\(/m.test(code))) {
      keep(index, code);
    }
  });

  let changed = true;
  while (changed) {
    changed = false;
    declarations.forEach(({ name, code }, index) => {
      if (!kept.has(index) && name !== undefined && used.has(name)) {
        keep(index, code);
        changed = true;
      }
    });
  }

  return {
    code: declarations
      .filter((_, index) => kept.has(index))
      .map(({ code }) => code)
      .join('\n\n'),
    used,
  };
}

function rawUniform(name: string, dataType: d.AnyWgslData): unknown {
  return tgpu['~unstable'].rawCodeSnippet(name, dataType, 'uniform', false).$;
}

/** Tells the code of a filter's shaders how to reach the values PixiJS gives the filter */
class FilterTarget implements FilterShaderTarget {
  readonly label: string;
  readonly #language: ShaderLanguage;
  readonly #uniforms: PixiUniforms<UniformRecord> | undefined;
  /** The PixiJS uniforms the GLSL reads, with their GLSL types */
  readonly glUniforms = new Map<string, string>();
  #glGlobals: FilterGlobalValues | undefined;

  constructor(
    label: string,
    language: ShaderLanguage,
    uniforms: PixiUniforms<UniformRecord> | undefined,
  ) {
    this.label = label;
    this.#language = language;
    this.#uniforms = uniforms;
  }

  uniformField(uniforms: PixiUniforms<UniformRecord>, key: string): unknown {
    if (uniforms !== this.#uniforms) {
      throw new Error(
        `[@typegpu/pixi] ${capitalize(this.label)} reads the uniform '${key}', which isn't one of its own. Pass the uniforms it reads to \`createFilter\` as \`uniforms\`.`,
      );
    }

    const schema = uniforms.schema[key] as UniformSchema;
    if (this.#language === 'wgsl') {
      return (uniformsLayoutOf(uniforms).$[UNIFORMS_ENTRY] as Record<string, unknown>)[key];
    }

    // PixiJS's WebGL renderer sets each value of a filter's uniform group
    // as a plain uniform named after its key
    this.glUniforms.set(key, glslTypes[schema.type] as string);
    return rawUniform(key, schema);
  }

  filterGlobals(): FilterGlobalValues {
    if (this.#language === 'wgsl') {
      return filterGlobalsLayout.$;
    }
    this.#glGlobals ??= this.#createGlGlobals();
    return this.#glGlobals;
  }

  #createGlGlobals(): FilterGlobalValues {
    const use = (name: string, glslType: string) => this.glUniforms.set(name, glslType);

    // PixiJS sets the global uniforms one by one, so `gfu` is a struct built from them.
    // Reading one field of it is turned back into reading the uniform, after generation.
    const gfu = tgpu['~unstable']
      .rawCodeSnippet(
        `${GFU_OPEN}GlobalFilterUniforms(${GLOBAL_UNIFORM_NAMES.join(', ')})${GFU_CLOSE}`,
        GlobalFilterUniforms,
        'runtime',
        false,
      )
      .$uses({ GlobalFilterUniforms }).$;

    return {
      get gfu() {
        for (const name of GLOBAL_UNIFORM_NAMES) {
          use(name, 'vec4');
        }
        return gfu;
      },
      get uTexture() {
        use('uTexture', 'sampler2D');
        return tgpu['~unstable'].rawCodeSnippet('uTexture', d.texture2d(d.f32), 'handle', false).$;
      },
      // GLSL samples through the texture, so the sampler never shows up in the code
      get uSampler() {
        return tgpu['~unstable'].rawCodeSnippet('uSampler', d.sampler(), 'handle', false).$;
      },
    } as FilterGlobalValues;
  }
}

const filterVertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));

type PipelineDescriptor = Parameters<TgpuRoot['createRenderPipeline']>[0];

function pipelineFor(
  root: TgpuRoot,
  vertex: ((input: FilterVertexIn) => FilterVertexOut) | undefined,
  fragment: (input: never) => d.v4f,
) {
  // The overloads of `createFilter` tie the two stages' types together. In here they're
  // only known to be some vertex function and a fragment function that fits it, which
  // TypeGPU's overloads can't check, so the descriptor is cast.
  return root.createRenderPipeline({
    attribs: { aPosition: filterVertexLayout.attrib },
    vertex: vertex ?? filterVertex,
    fragment,
  } as unknown as PipelineDescriptor);
}

/**
 * @returns The resources the shaders read straight from TypeGPU, if any
 */
function checkLayouts(
  label: string,
  language: ShaderLanguage,
  result: {
    usedBindGroupLayouts: readonly unknown[];
    catchall: [number, TgpuBindGroup] | undefined;
  },
  uniforms: PixiUniforms<UniformRecord> | undefined,
): [number, TgpuBindGroup] | undefined {
  const allowed = new Set<unknown>([filterGlobalsLayout, result.catchall?.[1].layout]);
  if (uniforms) {
    allowed.add(uniformLayouts.get(uniforms));
  }
  if (result.usedBindGroupLayouts.some((layout) => !allowed.has(layout))) {
    throw new Error(
      `[@typegpu/pixi] ${capitalize(label)} reads a TypeGPU bind group layout, and a filter has no bind group to fill it with. Read buffers, textures and samplers directly instead, like \`buffer.$\`.`,
    );
  }
  if (result.catchall && language === 'glsl') {
    throw webglResourcesError(label);
  }
  return result.catchall;
}

function webglResourcesError(label: string): Error {
  return new Error(
    `[@typegpu/pixi] ${capitalize(label)} reads a TypeGPU buffer, texture or sampler, which only exist on PixiJS's WebGPU renderer. For the WebGL renderer, pass values through \`uniforms\` instead.`,
  );
}

function findEntryPoint(wgsl: string, stage: 'vertex' | 'fragment'): string {
  const match = new RegExp(`@${stage}\\s+fn\\s+(\\w+)`).exec(wgsl);
  if (!match?.[1]) {
    throw new Error(`[@typegpu/pixi] There's no @${stage} function in the generated WGSL.`);
  }
  return match[1];
}

interface GeneratedWgsl {
  program: GpuProgram;
  /** The filter's uniform group, keyed by the name PixiJS finds at `@group(1) @binding(0)` */
  resources: Record<string, UniformGroup>;
  /** The TypeGPU resources the shaders read, to bind next to PixiJS's own */
  fixed: FixedResources | undefined;
}

function generateWgsl(
  root: TgpuRoot,
  options: GenerateOptions,
  group: UniformGroup | undefined,
): GeneratedWgsl {
  const { label, programName, vertex, fragment, uniforms } = options;
  const pipeline = pipelineFor(root, vertex, fragment);

  const result = withShaderTarget(new FilterTarget(label, 'wgsl', uniforms), () =>
    tgpu.resolveWithContext([pipeline]),
  );
  const catchall = checkLayouts(label, 'wgsl', result, uniforms);

  let wgsl = result.code;
  let fixed: FixedResources | undefined;
  if (catchall) {
    let [index] = catchall;
    if (index === 0) {
      // TypeGPU gives its resources the first free group, but PixiJS puts its own bind group
      // at index 0 on every draw, whether or not the shaders read anything from it
      index = uniforms && uniformLayouts.get(uniforms) === result.usedBindGroupLayouts[1] ? 2 : 1;
      wgsl = wgsl.replaceAll('@group(0)', `@group(${index})`);
    }
    fixed = fixedResourcesOf(root, index, catchall[1]);
  }

  const program = GpuProgram.from({
    name: programName,
    vertex: { source: wgsl, entryPoint: findEntryPoint(wgsl, 'vertex') },
    fragment: { source: wgsl, entryPoint: findEntryPoint(wgsl, 'fragment') },
  });

  if (fixed) {
    // PixiJS reads a bind group's layout off the WGSL, which doesn't say everything: which
    // stages read a resource, or whether a texture can be filtered. TypeGPU knows, and its
    // bind group only fits a pipeline whose layout says the same.
    program.gpuLayout[fixed.index] = fixed.layoutEntries;
  }

  // PixiJS binds a filter's resources by the names of the WGSL variables, but TypeGPU
  // renames a variable when another item has the same name. The binding index stays,
  // so the group goes under whatever name PixiJS finds at `@group(1) @binding(0)`.
  const resources: Record<string, UniformGroup> = {};
  if (group && uniforms && result.usedBindGroupLayouts.includes(uniformsLayoutOf(uniforms))) {
    for (const { group: groupIndex, binding, name } of program.structsAndGroups.groups) {
      if (groupIndex === 1 && binding === 0) {
        resources[name] = group;
      }
    }
  }

  return { program, resources, fixed };
}

/** Names PixiJS's WebGL renderer looks for in a filter's GLSL */
const GL_ATTRIBUTE = 'aPosition';
const GL_TEXTURE = 'uTexture';

const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

let resolutionRoot: TgpuRoot | undefined;

/**
 * A root that only turns pipelines into code, for renderers without a GPU device.
 * `@typegpu/gl` does the same to generate GLSL.
 */
function getResolutionRoot(): TgpuRoot {
  resolutionRoot ??= tgpu.initFromDevice({ device: {} as GPUDevice });
  return resolutionRoot;
}

/**
 * A namespace in which TypeGPU won't give any of its identifiers one of `names`,
 * so that the code can refer to PixiJS's uniforms and attribute by those names.
 * @returns The namespace, and the names it couldn't keep free because GLSL reserves them
 */
function namespaceWithout(names: readonly string[]) {
  const namespace = tgpu['~unstable'].namespace();
  const usable = names.filter((name) => /^[A-Za-z_]\w*$/.test(name) && !name.startsWith('gl_'));
  const externals = Object.fromEntries(
    usable.map((name, i) => [`_reserved${i}`, tgpu.const(d.f32, 0).$name(name)]),
  );
  // A constant gets its own name, unless that name is a GLSL keyword or already taken
  const reserved = tgpu.resolveWithContext({
    names: namespace,
    template: Object.keys(externals).join('\n'),
    externals,
    ...dualGlOptions().vertex,
  });
  const taken = new Set(reserved.declarations.map((declaration) => declaration.name));
  return { namespace, unusable: names.filter((name) => !taken.has(name)) };
}

/** The error to show when generating GLSL fails */
function glslError(label: string, error: unknown): unknown {
  // Errors of this package explain themselves, whichever language they come up in
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause.message.startsWith('[@typegpu/pixi]')) {
      return error;
    }
  }
  return new Error(
    `[@typegpu/pixi] Couldn't generate GLSL for ${label}, which PixiJS's WebGL renderer needs. Start PixiJS with \`preference: 'webgpu'\` to use WGSL instead.`,
    { cause: error },
  );
}

interface GeneratedGlsl {
  program: GlProgram;
  resources: Record<string, UniformGroup>;
}

function generateGlsl(options: GenerateOptions, group: UniformGroup | undefined): GeneratedGlsl {
  const { label, programName, vertex, fragment, uniforms } = options;
  const pipeline = pipelineFor(getResolutionRoot(), vertex, fragment);

  const pixiNames = [GL_ATTRIBUTE, GL_TEXTURE, ...GLOBAL_UNIFORM_NAMES];
  const keys = Object.keys(uniforms?.schema ?? {});
  const clashing = keys.filter((key) => pixiNames.includes(key));
  if (clashing.length > 0) {
    throw new Error(
      `[@typegpu/pixi] PixiJS's WebGL renderer sets each uniform of a filter under its own name, and ${clashing.map((key) => `'${key}'`).join(', ')} is already taken by PixiJS. Rename the uniform.`,
    );
  }

  // Each stage is generated from the whole pipeline, with generators that agree on
  // the names of the values the vertex stage passes to the fragment stage
  const glOptions = dualGlOptions();

  const generateStage = (stage: 'vertex' | 'fragment') => {
    const { namespace, unusable } = namespaceWithout([...pixiNames, ...keys]);
    if (unusable.length > 0) {
      throw new Error(
        `[@typegpu/pixi] PixiJS's WebGL renderer sets each uniform of a filter under its own name, but ${unusable.map((name) => `'${name}'`).join(', ')} can't be a name in GLSL. Rename the uniform.`,
      );
    }

    const target = new FilterTarget(label, 'glsl', uniforms);
    let result;
    try {
      result = withShaderTarget(target, () =>
        tgpu.resolveWithContext([pipeline], { names: namespace, ...glOptions[stage] }),
      );
    } catch (error) {
      // The GLSL generator may not get as far as noticing a TypeGPU resource
      let readsResources = false;
      try {
        readsResources =
          withShaderTarget(new FilterTarget(label, 'wgsl', uniforms), () =>
            tgpu.resolveWithContext([pipeline]),
          ).catchall !== undefined;
      } catch {
        // Whatever is wrong shows in both languages, so the first error says it
      }
      throw readsResources ? webglResourcesError(label) : glslError(label, error);
    }
    checkLayouts(label, 'glsl', result, uniforms);

    const { code, used } = reachableFromMain(
      result.declarations.map(({ name, code }) => ({ name, code: simplifyGlobals(code) })),
    );
    const uniformDeclarations = [...target.glUniforms]
      .filter(([name]) => used.has(name))
      .map(([name, type]) => `uniform ${type} ${name};`);
    return `${GLSL_HEADER}\n${uniformDeclarations.join('\n')}\n\n${code}\n`;
  };

  // PixiJS feeds the quad's corners through an attribute named `aPosition`,
  // but TypeGPU names a vertex input after its field with a prefix
  const attribute = /^layout\(location=0\) in vec2 (\w+);$/m;
  let vertexGlsl = generateStage('vertex');
  const attributeName = attribute.exec(vertexGlsl)?.[1];
  if (!attributeName) {
    throw new Error(`[@typegpu/pixi] The GLSL of ${label} doesn't read PixiJS's quad.`);
  }
  vertexGlsl = vertexGlsl.replace(new RegExp(`\\b${attributeName}\\b`, 'g'), GL_ATTRIBUTE);

  const program = GlProgram.from({
    name: programName,
    vertex: vertexGlsl,
    fragment: generateStage('fragment'),
  });

  // PixiJS's WebGL renderer sets a uniform group's values by their names,
  // so the group's own name doesn't matter
  return { program, resources: group ? { [UNIFORMS_ENTRY]: group } : {} };
}

interface GenerateOptions {
  label: string;
  programName: string;
  vertex: ((input: FilterVertexIn) => FilterVertexOut) | undefined;
  fragment: (input: never) => d.v4f;
  uniforms: PixiUniforms<UniformRecord> | undefined;
}

/**
 * Creates a PixiJS filter from TypeGPU functions.
 *
 * The fragment function returns the colour of each pixel of the filter's output.
 * It reads the input with `sampleInput`, and PixiJS's values for the filter through
 * `filterGlobals`. Its argument holds `uv`, the position in the input texture, unless
 * the filter has its own vertex stage, in which case it holds what that returns.
 *
 * PixiJS's WebGPU renderer gets WGSL and its WebGL renderer gets GLSL,
 * depending on which one `renderer` is.
 *
 * @example
 * ```ts
 * const wobbleUniforms = uniforms({ time: d.f32, strength: d.f32 });
 *
 * const wobble = createFilter(app.renderer, {
 *   uniforms: wobbleUniforms,
 *   padding: 20,
 *   fragment: ({ uv }) => {
 *     'use gpu';
 *     const offset = std.sin(uv.y * 40 + wobbleUniforms.$.time) * wobbleUniforms.$.strength;
 *     return sampleInput(uv + d.vec2f(offset, 0));
 *   },
 * });
 * wobbleUniforms.write(wobble, { strength: 0.01 });
 * sprite.filters = [wobble];
 * ```
 *
 * @example
 * ```ts
 * // A vertex stage of its own. What it returns besides `$position` reaches the fragment stage.
 * const aberration = createFilter(app.renderer, {
 *   vertex: ({ aPosition }) => {
 *     'use gpu';
 *     const uv = filterTextureCoord(aPosition);
 *     const offset = d.vec2f(4, 0) * filterGlobals.$.gfu.uInputSize.zw;
 *     return { $position: filterVertexPosition(aPosition), uvRed: uv - offset, uv, uvBlue: uv + offset };
 *   },
 *   fragment: ({ uvRed, uv, uvBlue }) => {
 *     'use gpu';
 *     const red = sampleInput(uvRed);
 *     const green = sampleInput(uv);
 *     const blue = sampleInput(uvBlue);
 *     return d.vec4f(red.r, green.g, blue.b, std.max(red.a, green.a, blue.a));
 *   },
 * });
 * ```
 *
 * On the WebGPU renderer, the functions can also read the buffers, textures and samplers of
 * the root that `getRoot(renderer)` returns, the way any TypeGPU shader does.
 *
 * @example
 * ```ts
 * // A filter that reads a TypeGPU buffer, which a compute pipeline could be writing to
 * const root = getRoot(app.renderer);
 * const tint = root.createUniform(d.vec3f, d.vec3f(1, 0.8, 0.6));
 *
 * const tinted = createFilter(app.renderer, {
 *   fragment: ({ uv }) => {
 *     'use gpu';
 *     const color = sampleInput(uv);
 *     return d.vec4f(color.rgb * tint.$, color.a);
 *   },
 * });
 * tint.write(d.vec3f(0.6, 0.8, 1));
 * ```
 *
 * @throws If PixiJS started with a renderer other than WebGPU or WebGL, if the functions
 *   read uniforms that weren't passed as `uniforms`, or if they read TypeGPU resources
 *   on the WebGL renderer.
 */
export function createFilter(
  renderer: Renderer,
  options: TgpuFilterOptions & { vertex?: undefined },
): Filter;
export function createFilter<TVertexOut extends FilterVertexOut>(
  renderer: Renderer,
  options: TgpuFilterOptions<TVertexOut> & {
    vertex: (input: FilterVertexIn) => TVertexOut;
  },
): Filter;
export function createFilter(
  renderer: Renderer,
  options: Omit<TgpuFilterOptions, 'vertex' | 'fragment'> & {
    vertex?: ((input: FilterVertexIn) => FilterVertexOut) | undefined;
    fragment: (input: never) => d.v4f;
  },
): Filter {
  const { name, uniforms, vertex, fragment, ...pixiOptions } = options;
  const generateOptions: GenerateOptions = {
    label: name ? `the filter '${name}'` : 'a filter',
    programName: name ?? 'tgpu-filter',
    vertex,
    fragment,
    uniforms,
  };

  const group = uniforms?.createGroup();

  let programs;
  let fixed: FixedResources | undefined;
  if (isWebGPURenderer(renderer)) {
    const generated = generateWgsl(getRoot(renderer), generateOptions, group);
    programs = { gpuProgram: generated.program, resources: generated.resources };
    fixed = generated.fixed;
  } else if (renderer.type === RendererType.WEBGL) {
    const { program, resources } = generateGlsl(generateOptions, group);
    programs = { glProgram: program, resources };
  } else {
    throw new Error(
      "[@typegpu/pixi] Filters made by `createFilter` need PixiJS's WebGPU or WebGL renderer, but PixiJS started with a different one.",
    );
  }

  const filter = new Filter({ ...pixiOptions, ...programs });
  if (fixed && isWebGPURenderer(renderer)) {
    filter.groups[fixed.index] = foreignBindGroup(renderer, fixed.bindGroup);
  }
  if (uniforms && group) {
    registerUniformGroup(filter, uniforms, group);
  }
  return filter;
}
