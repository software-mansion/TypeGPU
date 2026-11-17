import { glOptions } from '@typegpu/gl';
import { tgpu, type d } from 'typegpu';
import { capitalize, type ShaderTarget, withShaderTarget } from './context.ts';

/** PixiJS takes WGSL for its WebGPU renderer and GLSL ES 3.0 for its WebGL renderer */
export type ShaderLanguage = 'wgsl' | 'glsl';

// Raw expressions are wrapped in these while TypeGPU generates code, so that
// renaming TypeGPU's identifiers can't touch the PixiJS names inside them.
const RAW_OPEN = '\uE000';
const RAW_CLOSE = '\uE001';

/** A raw expression, or an identifier that isn't a member access or part of a number */
const TOKEN = /\uE000([^\uE001]*)\uE001|(?<![.\w])[A-Za-z_]\w*/g;

function resolveOptions(language: ShaderLanguage) {
  // A GLSL generator can only be used for one resolution
  return language === 'glsl' ? glOptions() : {};
}

/**
 * An expression that's copied into the shader as-is, typed as `dataType`.
 * Must be called while a shader is being generated.
 */
export function rawExpression(expression: string, dataType: d.AnyWgslData): unknown {
  return tgpu['~unstable'].rawCodeSnippet(
    `${RAW_OPEN}${expression}${RAW_CLOSE}`,
    dataType,
    'runtime',
  ).$;
}

function renameTokens(code: string, names: ReadonlyMap<string, string>): string {
  return code.replace(TOKEN, (match: string, raw: string | undefined) =>
    raw !== undefined ? raw : (names.get(match) ?? match),
  );
}

/**
 * A struct's field names are left alone, since member accesses (`value.field`) are too.
 * Only the struct's own name and the types of its fields are renamed.
 */
function renameStruct(
  code: string,
  language: ShaderLanguage,
  names: ReadonlyMap<string, string>,
): string {
  const open = code.indexOf('{');
  const close = code.lastIndexOf('}');
  if (open === -1 || close === -1) {
    return renameTokens(code, names);
  }

  const fields = code
    .slice(open + 1, close)
    .split('\n')
    .map((line) => {
      // WGSL: `name: type,` and GLSL: `type name;`
      const match =
        language === 'wgsl'
          ? /^(?<name>\s*(?:@\w+(?:\([^)]*\))?\s*)*\w+\s*:)(?<type>.*)$/.exec(line)
          : /^(?<type>.*?)(?<name>\s+\w+\s*(?:\[[^\]]*\])?\s*;\s*)$/.exec(line);
      if (!match?.groups) {
        return line;
      }
      const type = renameTokens(match.groups.type as string, names);
      return language === 'wgsl' ? `${match.groups.name}${type}` : `${type}${match.groups.name}`;
    })
    .join('\n');

  return `${renameTokens(code.slice(0, open), names)}{${fields}${code.slice(close)}`;
}

export interface GeneratedModule {
  /** Module-scope code: the functions, structs, constants and variables that were generated */
  readonly header: string;
  /** The identifier a function or variable has in `header` */
  idOf(item: object): string;
}

export interface GenerateModuleOptions {
  language: ShaderLanguage;
  /** The functions to generate. Everything they use is generated along with them. */
  items: object[];
  /**
   * Put in front of every generated identifier. PixiJS pastes the code into a shader that
   * holds its own declarations and other libraries' too, so plain names could clash.
   */
  prefix: string;
  /** Items that take an exact name instead of a prefixed one */
  fixedNames?: ReadonlyMap<object, string> | undefined;
  target: ShaderTarget;
}

/**
 * Generates the code of `items` and their dependencies in one language,
 * with every module-scope identifier prefixed.
 */
export function generateModule(options: GenerateModuleOptions): GeneratedModule {
  const { language, items, prefix, fixedNames, target } = options;
  const namespace = tgpu['~unstable'].namespace();

  // Within this namespace, an item resolves to the same identifier every time
  const rawIdOf = (item: object) =>
    withShaderTarget(target, () =>
      tgpu.resolve({
        names: namespace,
        template: 'ITEM',
        externals: { ITEM: item },
        ...resolveOptions(language),
      }),
    ).trim();

  let result;
  try {
    result = withShaderTarget(target, () =>
      tgpu.resolveWithContext(items as Parameters<typeof tgpu.resolveWithContext>[0], {
        names: namespace,
        ...resolveOptions(language),
      }),
    );
  } catch (error) {
    if (language === 'glsl') {
      throw new Error(
        `[@typegpu/pixi] Couldn't generate GLSL for ${target.label}. If it only has to run on PixiJS's WebGPU renderer, pass \`backend: 'gpu'\`.`,
        { cause: error },
      );
    }
    throw error;
  }

  if (result.catchall !== undefined || result.usedBindGroupLayouts.length > 0) {
    throw new Error(
      `[@typegpu/pixi] ${capitalize(target.label)} reads a TypeGPU buffer, texture or bind group layout, and PixiJS 3D binds everything in its shaders by itself. Pass values through \`uniforms\`, and give a material's shader bits their textures through \`textureSlot\`.`,
    );
  }

  const names = new Map<string, string>();
  const taken = new Set<string>();

  const fixed = new Map<string, string>();
  for (const [item, name] of fixedNames ?? []) {
    fixed.set(rawIdOf(item), name);
    taken.add(name);
  }

  for (const declaration of result.declarations) {
    const name = declaration.name;
    if (name === undefined || names.has(name)) {
      continue;
    }

    let renamed = fixed.get(name);
    if (renamed === undefined) {
      // GLSL reserves identifiers that hold two underscores in a row
      const base = `${prefix}_${name}`.replace(/_{2,}/g, '_');
      renamed = base;
      for (let i = 1; taken.has(renamed); i++) {
        renamed = `${base}_${i}`;
      }
    }

    taken.add(renamed);
    names.set(name, renamed);
  }

  const header = result.declarations
    .map(({ code }) =>
      /^\s*struct\s/.test(code) ? renameStruct(code, language, names) : renameTokens(code, names),
    )
    .join('\n\n');

  return {
    header,
    idOf: (item) => renameTokens(rawIdOf(item), names),
  };
}

/** Turns any string into something that can start an identifier in both languages */
export function toIdentifier(name: string): string {
  const id = name.replace(/\W+/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
  if (id === '') {
    return 'tgpu';
  }
  return /^\d/.test(id) ? `tgpu_${id}` : id;
}
