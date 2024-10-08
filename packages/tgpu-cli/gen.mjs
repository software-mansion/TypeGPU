// @ts-check

import fs from 'node:fs/promises';
import path from 'node:path';
import { exit } from 'node:process';
import { ArrayInfo, StructInfo, TemplateInfo, WgslReflect } from 'wgsl_reflect';

const cwd = new URL(`file:${process.cwd()}/`);

const LENGTH_VAR = 'arrayLength';

export class Context {
  /**
   * @param { {toTs: boolean, toCommonJs: boolean} } options
   */
  constructor(options) {
    this.toTs = options.toTs;
    this.toCommonJs = options.toCommonJs;

    /** @type { string[] } */
    this.exportsList = [];
  }
}

/**
 * @param { string } input
 * @param { string } output
 * @param { boolean } toTs
 * @param { boolean } toCommonJs
 * @param { "keep" |  "overwrite" | "nocheck" | undefined } overwriteMode
 */
async function main(input, output, toTs, toCommonJs, overwriteMode) {
  const inputPath = new URL(input, cwd);
  const outputPath = new URL(output, cwd);
  const inputContents = await fs.readFile(inputPath, 'utf8');

  if (overwriteMode !== 'nocheck') {
    const fileExists = await fs
      .access(output)
      .then(() => true)
      .catch(() => false);

    if (fileExists) {
      if (overwriteMode === undefined) {
        console.error(
          `Error: File ${output} already exists. Use --overwrite option to replace existing files or --keep to skip them.`,
        );

        exit(1);
      }

      if (overwriteMode === 'keep') {
        console.log(`Skipping ${input}, file ${output} already exists.`);
        return;
      }
    }
  }

  const generated = generate(inputContents, new Context({ toTs, toCommonJs }));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(outputPath, generated);
}

/**
 * @param { string } wgsl
 * @param { Context } ctx
 */
export function generate(
  wgsl,
  ctx = new Context({ toTs: true, toCommonJs: false }),
) {
  const reflect = new WgslReflect(wgsl);

  return `/* generated via tgpu-cli by TypeGPU */

${
  ctx.toCommonJs
    ? `\
const tgpu = require('typegpu').default;
const d = require('typegpu/data');`
    : `\
import tgpu from 'typegpu';
import * as d from 'typegpu/data';`
}

${generateStructs(reflect.structs, ctx)}

${generateAliases(reflect.aliases, ctx)}

${generateBindGroupLayouts(reflect.getBindGroups(), ctx)}

${generateExports(ctx)}
`.trim();
}

/**
 * @param { import('wgsl_reflect').StructInfo[] } structs
 * @param { Context } ctx
 */
function generateStructs(structs, ctx) {
  return structs.length > 0
    ? `/* structs */
${structs.map((struct) => generateStruct(struct, ctx)).join('\n\n')}`
    : '';
}

/**
 * @param { import('wgsl_reflect').StructInfo } struct
 * @param { Context } ctx
 */
function generateStruct(struct, ctx) {
  return `${declareConst(struct.name, ctx)} = ${
    hasVarLengthMember(struct)
      ? `(${LENGTH_VAR}${ctx.toTs ? ': number' : ''}) => `
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
 * @param { Context } ctx
 */
function generateAliases(aliases, ctx) {
  return aliases.length > 0
    ? `/* aliases */
${aliases
  .map(
    (alias) =>
      `${declareConst(alias.name, ctx)} = ${generateType(alias.type)};`,
  )
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
 * @param { Context } ctx
 */
function generateBindGroupLayouts(bindGroups, ctx) {
  return bindGroups.length > 0
    ? `/* bindGroupLayouts */
${bindGroups
  .flatMap(
    (group, index) => `\
${declareConst(`layout${index}`, ctx)} = tgpu.bindGroupLayout({
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

/**
 * @param { string } ident
 * @param { Context } ctx
 */
function declareConst(ident, ctx) {
  if (ctx.toCommonJs) {
    ctx.exportsList.push(ident);
    return `const ${ident}`;
  }
  return `export const ${ident}`;
}

/**
 * @param { Context } ctx
 */
function generateExports(ctx) {
  return ctx.toCommonJs
    ? `module.exports = {${ctx.exportsList.join(', ')}};`
    : '';
}

export default main;
