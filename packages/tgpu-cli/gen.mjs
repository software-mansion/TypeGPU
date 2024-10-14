// @ts-check

import fs from 'node:fs/promises';
import path from 'node:path';
import { exit } from 'node:process';
import { ArrayInfo, StructInfo, TemplateInfo, WgslReflect } from 'wgsl_reflect';

/**
 * @typedef {import('wgsl_reflect').AliasInfo} AliasInfo
 * @typedef {import('wgsl_reflect').MemberInfo} MemberInfo
 * @typedef {import('wgsl_reflect').TypeInfo} TypeInfo
 * @typedef {import('wgsl_reflect').VariableInfo} VariableInfo
 */

const cwd = new URL(`file:${process.cwd()}/`);

const LENGTH_VAR = 'arrayLength';

/**
 * @typedef {object} Options
 * @prop {string} inputPath
 * @prop {string} outputPath
 * @prop {boolean} toTs
 * @prop {'commonjs' | 'esmodule'} moduleSyntax
 * @prop {'keep' | 'overwrite'} [existingFileStrategy]
 * @prop {Set<string>} [declaredIdentifiers]
 */

/**
 * @param {Options} options
 */
async function main(options) {
  const inputPath = new URL(options.inputPath, cwd);
  const outputPath = new URL(options.outputPath, cwd);
  const inputContents = await fs.readFile(inputPath, 'utf8');

  if (options.existingFileStrategy !== 'overwrite') {
    const fileExists = await fs
      .access(options.outputPath)
      .then(() => true)
      .catch(() => false);

    if (fileExists) {
      if (options.existingFileStrategy === undefined) {
        console.error(
          `Error: File ${options.outputPath} already exists. Use --overwrite option to replace existing files or --keep to skip them.`,
        );

        exit(1);
      }

      if (options.existingFileStrategy === 'keep') {
        console.log(
          `Skipping ${options.inputPath}, file ${options.outputPath} already exists.`,
        );
        return;
      }
    }
  }

  const generated = generate(inputContents, options);
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(outputPath, generated);
}

/**
 * @param {StructInfo[]} structs
 */
function topologicalSort(structs) {
  const allStructs = Object.fromEntries(
    structs.map((struct) => [struct.name, struct]),
  );
  const allStructNames = Object.keys(allStructs);

  /** @type {Record<string, Set<string>>} */
  const neighbors = {};

  for (const struct of structs) {
    neighbors[struct.name] = new Set();
    for (const neighbor of struct.members) {
      if (allStructNames.includes(neighbor.type.name)) {
        neighbors[struct.name].add(neighbor.type.name);
      }
      if (
        neighbor.type instanceof ArrayInfo &&
        allStructNames.includes(neighbor.type.format.name)
      ) {
        neighbors[struct.name].add(neighbor.type.format.name);
      }
    }
  }

  const visited = Object.fromEntries(
    allStructNames.map((name) => [name, false]),
  );
  /** @type {StructInfo[]} */
  const result = [];

  /** @param {string} structName */
  function dns(structName) {
    visited[structName] = true;

    for (const neighbor of neighbors[structName]) {
      if (!visited[neighbor]) {
        dns(neighbor);
      }
    }

    result.push(allStructs[structName]);
  }

  for (const structName of Object.keys(allStructs)) {
    if (!visited[structName]) {
      dns(structName);
    }
  }

  return result;
}

/**
 * @param {string} wgsl
 * @param {Options} options
 */
export function generate(
  wgsl,
  options = {
    inputPath: '',
    outputPath: '',
    toTs: true,
    moduleSyntax: 'esmodule',
  },
) {
  const reflect = new WgslReflect(wgsl);

  return `/* generated via tgpu-cli by TypeGPU */

${
  options.moduleSyntax === 'commonjs'
    ? `\
const tgpu = require('typegpu').default;
const d = require('typegpu/data');`
    : `\
import tgpu from 'typegpu';
import * as d from 'typegpu/data';`
}
${generateStructs(topologicalSort(reflect.structs), options)}
${generateAliases(reflect.aliases, options)}
${generateBindGroupLayouts(reflect.getBindGroups(), options)}
${generateExports(options)}
`;
}

/**
 * @param {StructInfo[]} structs
 * @param {Options} options
 */
function generateStructs(structs, options) {
  return structs.length > 0
    ? `\n/* structs */
${structs.map((struct) => generateStruct(struct, options)).join('\n\n')}`
    : '';
}

/**
 * @param {StructInfo} struct
 * @param {Options} options
 */
function generateStruct(struct, options) {
  return `${declareConst(struct.name, options)} = ${
    hasVarLengthMember(struct)
      ? `(${LENGTH_VAR}${options.toTs ? ': number' : ''}) => `
      : ''
  }d.struct({
  ${struct.members.map((member) => generateStructMember(member, options)).join('\n  ')}
});`;
}

/**
 * @param {StructInfo} struct
 */
function hasVarLengthMember(struct) {
  const member = struct.members[struct.members.length - 1].type;
  return member instanceof ArrayInfo && member.size === 0;
}

/**
 * @param {AliasInfo[]} aliases
 * @param {Options} options
 */
function generateAliases(aliases, options) {
  return aliases.length > 0
    ? `\n/* aliases */
${aliases
  .map(
    (alias) =>
      `${declareConst(alias.name, options)} = ${generateType(alias.type, options)};`,
  )
  .join('\n')}`
    : '';
}

/**
 * @param {MemberInfo} member
 * @param {Options} options
 */
function generateStructMember(member, options) {
  return `${member.name}: ${generateType(member.type, options)},`;
}

/**
 * @param {TypeInfo} type_
 * @param {Options} options
 */
function generateType(type_, options) {
  if (
    type_.size === 0 &&
    !type_.isArray &&
    !options.declaredIdentifiers?.has(type_.name)
  ) {
    throw new Error(`Unknown data type: ${type_.name}`);
  }

  const tgpuType =
    type_ instanceof StructInfo
      ? type_.name
      : type_ instanceof ArrayInfo
        ? `d.arrayOf(${generateType(type_.format, options)}, ${type_.count > 0 ? type_.count : LENGTH_VAR})`
        : type_ instanceof TemplateInfo &&
            type_.name === 'atomic' &&
            type_.format
          ? `d.atomic(${generateType(type_.format, options)})`
          : type_.size === 0
            ? type_.name
            : `d.${replaceWithAlias(type_)}`;

  return (
    type_.attributes?.reduce(
      (acc, attribute) =>
        ['align', 'size'].includes(attribute.name)
          ? `d.${attribute.name}(${attribute.value}, ${acc})`
          : acc,
      tgpuType,
    ) ?? tgpuType
  );
}

/**
 * @param {string} type
 * @param {string} format
 */
function typeToAlias(type, format) {
  if (
    ['vec2', 'vec3', 'vec4'].includes(type) &&
    ['i32', 'u32', 'f32'].includes(format)
  ) {
    return type + format[0];
  }
}

/**
 * @param {TypeInfo} type
 */
function replaceWithAlias(type) {
  return type instanceof TemplateInfo
    ? typeToAlias(type.name, type.format?.name ?? '')
    : type.name;
}

/**
 * @param {VariableInfo[][]} bindGroups
 * @param {Options} options
 */
function generateBindGroupLayouts(bindGroups, options) {
  return bindGroups.length > 0
    ? `\n/* bindGroupLayouts */
${bindGroups
  .flatMap(
    (group, index) => `\
${declareConst(`layout${index}`, options)} = tgpu.bindGroupLayout({
  ${generateGroupLayout(group, options)}
});`,
  )
  .join('\n\n')}`
    : '';
}

const RESOURCE_GENERATORS = [
  generateUniformVariable,
  generateStorageVariable,
  generateTextureVariable,
  generateSamplerVariable,
  generateStorageTextureVariable,
];

const ACCESS_TYPES = {
  read: 'readonly',
  write: 'writeonly',
  read_write: 'mutable',
};

const SAMPLE_TYPES = {
  u32: 'uint',
  i32: 'sint',
  f32: 'float',
};

/**
 * @param {VariableInfo[]} group
 * @param {Options} options
 */
function generateGroupLayout(group, options) {
  return Array.from(group)
    .map((variable, index) =>
      variable
        ? `${variable.name}: ${generateVariable(variable, options)},`
        : `_${index}: null, // skipping binding ${index}`,
    )
    .join('\n  ');
}

/**
 * @param {VariableInfo} variable
 * @param {Options} options
 */
function generateVariable(variable, options) {
  return RESOURCE_GENERATORS[variable.resourceType](variable, options);
}

/**
 * @param {VariableInfo} variable
 * @param {Options} options
 */
function generateUniformVariable(variable, options) {
  return `{
    uniform: ${generateType(variable.type, options)},
  }`;
}

/**
 * @param {VariableInfo} variable
 * @param {Options} options
 */
function generateStorageVariable(variable, options) {
  return `{
    storage: ${generateType(variable.type, options)},${
      variable.access ? `\n    access: '${ACCESS_TYPES[variable.access]}',` : ''
    }
  }`;
}

/**
 * @param {VariableInfo} variable
 */
function getViewDimension(variable) {
  const type_ = variable.type.name;
  const dimension = type_.includes('_1d')
    ? '1d'
    : type_.includes('_2d')
      ? '2d'
      : type_.includes('_3d')
        ? '3d'
        : type_.includes('_cube')
          ? 'cube'
          : null;

  return type_.includes('_array')
    ? `${dimension ?? '2d'}-array`
    : dimension !== '2d'
      ? dimension
      : null;
}

/**
 * @param {VariableInfo} variable
 */
function generateStorageTextureVariable(variable) {
  const viewDimension = getViewDimension(variable);
  const access =
    variable.type instanceof TemplateInfo ? variable.type.access : null;

  return `{
    storageTexture: '${variable.format?.name}',${
      access ? `\n    access: '${ACCESS_TYPES[access]}',` : ''
    }${viewDimension ? `\n    viewDimension: '${viewDimension}',` : ''}
  }`;
}

const SAMPLER_TYPES = {
  sampler: 'filtering',
  sampler_comparison: 'comparison',
};

/**
 * @param {VariableInfo} variable
 */
function generateSamplerVariable(variable) {
  return `{
    sampler: '${SAMPLER_TYPES[variable.type.name]}',
  }`;
}

/**
 * @param {VariableInfo} variable
 */
function generateTextureVariable(variable) {
  const type_ = variable.type.name;

  if (type_ === 'texture_external') {
    return generateExternalTextureVariable(variable);
  }

  const format = variable.format?.name;
  const viewDimension = getViewDimension(variable);
  const multisampled = type_.includes('_multisampled');

  return `{
    texture: '${type_.includes('_depth') ? 'depth' : SAMPLE_TYPES[format]}',${
      viewDimension ? `\n    viewDimension: '${viewDimension}',` : ''
    }${multisampled ? '\n    multisampled: true,' : ''}
  }`;
}

/**
 * @param {VariableInfo} variable
 */
function generateExternalTextureVariable(variable) {
  return `{
    externalTexture: {},
  }`;
}

/**
 * @param {string} ident
 * @param {Options} options
 */
function declareConst(ident, options) {
  if (options.declaredIdentifiers === undefined) {
    options.declaredIdentifiers = new Set([ident]);
  } else {
    options.declaredIdentifiers.add(ident);
  }

  return `${options.moduleSyntax === 'esmodule' ? 'export ' : ''}const ${ident}`;
}

/**
 * @param {Options} options
 */
function generateExports(options) {
  return options.moduleSyntax === 'commonjs'
    ? `\nmodule.exports = {${[...(options.declaredIdentifiers ?? [])].join(', ')}};`
    : '';
}

export default main;
