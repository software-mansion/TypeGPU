// @ts-check

import fs from 'node:fs/promises';
import { ArrayInfo, StructInfo, TemplateInfo, WgslReflect } from 'wgsl_reflect';

const cwd = new URL(`file:${process.cwd()}/`);

const LENGTH_VAR = 'arrayLength';

/**
 * @param { string } input
 * @param { string } output
 */
async function main(input, output) {
  const inputPath = new URL(input, cwd);
  const outputPath = new URL(output, cwd);
  const toTs = output.endsWith('.ts');
  const inputContents = await fs.readFile(inputPath, 'utf8');

  await fs.writeFile(outputPath, generate(inputContents, toTs));
}

/**
 * @param { string } wgsl
 * @param { boolean } toTs
 */
export function generate(wgsl, toTs = true) {
  const reflect = new WgslReflect(wgsl);

  return `/* generated via tgpu-cli by TypeGPU */

import tgpu from 'typegpu';
import * as d from 'typegpu/data';

${generateStructs(reflect.structs, toTs)}

${generateAliases(reflect.aliases)}

${generateBindGroupLayouts(reflect.getBindGroups())}
`.trim();
}

/**
 * @param { import('wgsl_reflect').StructInfo[] } structs
 * @param { boolean } toTs
 */
function generateStructs(structs, toTs) {
  return structs.length > 0
    ? `/* structs */
${structs.map((struct) => generateStruct(struct, toTs)).join('\n\n')}`
    : '';
}

/**
 * @param { import('wgsl_reflect').StructInfo } struct
 * @param { boolean } toTs
 */
function generateStruct(struct, toTs) {
  return `export const ${struct.name} = ${
    hasVarLengthMember(struct)
      ? `(${LENGTH_VAR}${toTs ? ': number' : ''}) => `
      : ''
  }d.struct({
  ${struct.members.map((member) => generateStructMember(member)).join('\n  ')}
});`;
}

/**
 * @param { import('wgsl_reflect').StructInfo } struct
 */
function hasVarLengthMember(struct) {
  const member = struct.members[struct.members.length - 1].type;
  return member instanceof ArrayInfo && member.size === 0;
}

/**
 * @param { import('wgsl_reflect').AliasInfo[] } aliases
 */
function generateAliases(aliases) {
  return aliases.length > 0
    ? `/* aliases */
${aliases
  .map((alias) => `export const ${alias.name} = ${generateType(alias.type)};`)
  .join('\n')}`
    : '';
}

/**
 * @param { import('wgsl_reflect').MemberInfo } member
 */
function generateStructMember(member) {
  return `${member.name}: ${generateType(member.type)},`;
}

/**
 * @param { import('wgsl_reflect').TypeInfo } type_
 * @param { boolean } checkNonZeroLength
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
 * @param { string } type
 * @param { string } format
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
 * @param { import('wgsl_reflect').TypeInfo } type
 */
function replaceWithAlias(type) {
  return type instanceof TemplateInfo
    ? typeToAlias(type.name, type.format?.name ?? '')
    : type.name;
}

/**
 * @param { import('wgsl_reflect').VariableInfo[][] } bindGroups
 */
function generateBindGroupLayouts(bindGroups) {
  return bindGroups.length > 0
    ? `/* bindGroupLayouts */
${bindGroups
  .flatMap(
    (group, index) => `\
export const layout${index} = tgpu.bindGroupLayout({
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
 * @param { import('wgsl_reflect').VariableInfo[] } group
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
 * @param { import('wgsl_reflect').VariableInfo } variable
 */
function generateVariable(variable) {
  return RESOURCE_GENERATORS[variable.resourceType](variable);
}

/**
 * @param { import('wgsl_reflect').VariableInfo } variable
 */
function generateUniformVariable(variable) {
  return `{
    uniform: ${generateType(variable.type)},
  }`;
}

/**
 * @param { import('wgsl_reflect').VariableInfo } variable
 */
function generateStorageVariable(variable) {
  return `{
    storage: ${generateType(variable.type, false)},${
      variable.access ? `\n    access: '${ACCESS_TYPES[variable.access]}',` : ''
    }
  }`;
}

/**
 * @param { import('wgsl_reflect').VariableInfo } variable
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
 * @param { import('wgsl_reflect').VariableInfo } variable
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
 * @param { import('wgsl_reflect').VariableInfo } variable
 */
function generateSamplerVariable(variable) {
  return `{
    sampler: '${SAMPLER_TYPES[variable.type.name]}',
  }`;
}

/**
 * @param { import('wgsl_reflect').VariableInfo } variable
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
 * @param { import('wgsl_reflect').VariableInfo } variable
 */
function generateExternalTextureVariable(variable) {
  return `{
    externalTexture: {},
  }`;
}

export default main;
