// @ts-check

import fs from 'node:fs/promises';
import path from 'node:path';
import { exit } from 'node:process';
import { ArrayInfo, StructInfo, TemplateInfo, WgslReflect } from 'wgsl_reflect';

const cwd = new URL(`file:${process.cwd()}/`);

const LENGTH_VAR = 'arrayLength';

/**
 * @typedef {object} Options
 * @prop {string} input
 * @prop {string} output
 * @prop {boolean} toTs
 * @prop {'commonjs'|'esmodule'} moduleSyntax
 * @prop {'keep'|'overwrite'} [existingFileStrategy]
 * @prop {string[]} [exportsList]
 */

/**
 * @param {Options} options
 */
async function main(options) {
  const inputPath = new URL(options.input, cwd);
  const outputPath = new URL(options.output, cwd);
  const inputContents = await fs.readFile(inputPath, 'utf8');

  if (options.existingFileStrategy !== 'overwrite') {
    const fileExists = await fs
      .access(options.output)
      .then(() => true)
      .catch(() => false);

    if (fileExists) {
      if (options.existingFileStrategy === undefined) {
        console.error(
          `Error: File ${options.output} already exists. Use --overwrite option to replace existing files or --keep to skip them.`,
        );

        exit(1);
      }

      if (options.existingFileStrategy === 'keep') {
        console.log(
          `Skipping ${options.input}, file ${options.output} already exists.`,
        );
        return;
      }
    }
  }

  const generated = generate(inputContents, options);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(outputPath, generated);
}

/**
 * @param {string} wgsl
 * @param {Options} options
 */
export function generate(
  wgsl,
  options = {
    input: '',
    output: '',
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
${generateStructs(reflect.structs, options)}
${generateAliases(reflect.aliases, options)}
${generateBindGroupLayouts(reflect.getBindGroups(), options)}
${generateExports(options)}
`;
}

/**
 * @param {import('wgsl_reflect').StructInfo[]} structs
 * @param {Options} options
 */
function generateStructs(structs, options) {
  return structs.length > 0
    ? `\n/* structs */
${structs.map((struct) => generateStruct(struct, options)).join('\n\n')}`
    : '';
}

/**
 * @param {import('wgsl_reflect').StructInfo} struct
 * @param {Options} options
 */
function generateStruct(struct, options) {
  return `${declareConst(struct.name, options)} = ${
    hasVarLengthMember(struct)
      ? `(${LENGTH_VAR}${options.toTs ? ': number' : ''}) => `
      : ''
  }d.struct({
  ${struct.members.map((member) => generateStructMember(member)).join('\n  ')}
});`;
}

/**
 * @param {import('wgsl_reflect').StructInfo} struct
 */
function hasVarLengthMember(struct) {
  const member = struct.members[struct.members.length - 1].type;
  return member instanceof ArrayInfo && member.size === 0;
}

/**
 * @param {import('wgsl_reflect').AliasInfo[]} aliases
 * @param {Options} options
 */
function generateAliases(aliases, options) {
  return aliases.length > 0
    ? `\n/* aliases */
${aliases
  .map(
    (alias) =>
      `${declareConst(alias.name, options)} = ${generateType(alias.type)};`,
  )
  .join('\n')}`
    : '';
}

/**
 * @param {import('wgsl_reflect').MemberInfo} member
 */
function generateStructMember(member) {
  return `${member.name}: ${generateType(member.type)},`;
}

/**
 * @param {import('wgsl_reflect').TypeInfo} type_
 * @param {boolean} checkNonZeroLength
 */
function generateType(type_, checkNonZeroLength = true) {
  if (checkNonZeroLength && type_.size === 0 && !type_.isArray) {
    throw new Error(`Invalid data type with size 0: ${type_.name}`);
  }

  const tgpuType =
    type_ instanceof StructInfo
      ? type_.name
      : type_ instanceof ArrayInfo
        ? `d.arrayOf(${generateType(type_.format)}, ${type_.count > 0 ? type_.count : LENGTH_VAR})`
        : type_ instanceof TemplateInfo &&
            type_.name === 'atomic' &&
            type_.format
          ? `d.atomic(${generateType(type_.format)})`
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
 * @param {import('wgsl_reflect').TypeInfo} type
 */
function replaceWithAlias(type) {
  return type instanceof TemplateInfo
    ? typeToAlias(type.name, type.format?.name ?? '')
    : type.name;
}

/**
 * @param {import('wgsl_reflect').VariableInfo[][]} bindGroups
 * @param {Options} options
 */
function generateBindGroupLayouts(bindGroups, options) {
  return bindGroups.length > 0
    ? `\n/* bindGroupLayouts */
${bindGroups
  .flatMap(
    (group, index) => `\
${declareConst(`layout${index}`, options)} = tgpu.bindGroupLayout({
  ${generateGroupLayout(group)}
}).$forceIndex(${index});`,
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
 * @param {import('wgsl_reflect').VariableInfo[]} group
 */
function generateGroupLayout(group) {
  return Array.from(group)
    .map((variable, index) =>
      variable
        ? `${variable.name}: ${generateVariable(variable)},`
        : `_${index}: null, // skipping binding ${index}`,
    )
    .join('\n  ');
}

/**
 * @param {import('wgsl_reflect').VariableInfo} variable
 */
function generateVariable(variable) {
  return RESOURCE_GENERATORS[variable.resourceType](variable);
}

/**
 * @param {import('wgsl_reflect').VariableInfo} variable
 */
function generateUniformVariable(variable) {
  return `{
    uniform: ${generateType(variable.type)},
  }`;
}

/**
 * @param {import('wgsl_reflect').VariableInfo} variable
 */
function generateStorageVariable(variable) {
  return `{
    storage: ${generateType(variable.type, false)},${
      variable.access ? `\n    access: '${ACCESS_TYPES[variable.access]}',` : ''
    }
  }`;
}

/**
 * @param {import('wgsl_reflect').VariableInfo} variable
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
 * @param {import('wgsl_reflect').VariableInfo} variable
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
 * @param {import('wgsl_reflect').VariableInfo} variable
 */
function generateSamplerVariable(variable) {
  return `{
    sampler: '${SAMPLER_TYPES[variable.type.name]}',
  }`;
}

/**
 * @param {import('wgsl_reflect').VariableInfo} variable
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
 * @param {import('wgsl_reflect').VariableInfo} variable
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
  if (options.moduleSyntax === 'commonjs') {
    if (options.exportsList === undefined) {
      options.exportsList = [ident];
    } else {
      options.exportsList.push(ident);
    }

    return `const ${ident}`;
  }
  return `export const ${ident}`;
}

/**
 * @param {Options} options
 */
function generateExports(options) {
  return options.moduleSyntax === 'commonjs'
    ? `\nmodule.exports = {${(options.exportsList ?? []).join(', ')}};`
    : '';
}

export default main;
