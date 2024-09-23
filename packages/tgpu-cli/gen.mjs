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

import * as d from 'typegpu/data';

${generateStructs(reflect.structs, toTs)}
${generateAliases(reflect.aliases)}
`;
}

/**
 * @param { import('wgsl_reflect').StructInfo[] } structs
 * @param { boolean } toTs
 */
function generateStructs(structs, toTs) {
  return `/* structs */
${structs.map((struct) => generateStruct(struct, toTs)).join('\n\n')}  
`;
}

/**
 * @param { import('wgsl_reflect').StructInfo } struct
 * @param { boolean } toTs
 */
function generateStruct(struct, toTs) {
  return `const ${struct.name} =${hasVarLengthMember(struct) ? ` (${LENGTH_VAR}${toTs ? ': number' : ''}) =>` : ''} d.struct({
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
  return `/* aliases */
${aliases
  .map((alias) => `const ${alias.name} = ${generateType(alias.type)};`)
  .join('\n')}`;
}

/**
 * @param { import('wgsl_reflect').MemberInfo } member
 */
function generateStructMember(member) {
  return `${member.name}: ${generateType(member.type)},`;
}

/**
 * @param { import('wgsl_reflect').TypeInfo } type
 */
function generateType(type) {
  if (type instanceof ArrayInfo) {
    return `d.arrayOf(${generateType(type.format)}, ${type.count > 0 ? type.count : LENGTH_VAR})`;
  }

  if (type.size === 0) {
    throw new Error(`Invalid data type with size 0: ${type.name}`);
  }

  if (type instanceof TemplateInfo && type.name === 'atomic' && type.format) {
    return `d.atomic(${generateType(type.format)})`;
  }

  const tgpuType = `${type instanceof StructInfo ? '' : 'd.'}${replaceWithAlias(type)}`;

  return (
    type.attributes?.reduce(
      (acc, attribute) =>
        ['align', 'size'].includes(attribute.name)
          ? `d.${attribute.name}(${acc}, ${attribute.value})`
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

export default main;
