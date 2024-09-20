// @ts-check

import fs from 'node:fs/promises';
import { StructInfo, TemplateInfo, WgslReflect } from 'wgsl_reflect';

const cwd = new URL(`file:${process.cwd()}/`);

/**
 * @param { string } input
 * @param { string } output
 */
async function generate(input, output) {
  const inputPath = new URL(input, cwd);
  const outputPath = new URL(output, cwd);

  const inputContents = await fs.readFile(inputPath, 'utf8');
  const reflect = new WgslReflect(inputContents);

  const resultTs = `/* generated via tgpu-cli by TypeGPU */

import * as d from 'typegpu/data';

${generateStructs(reflect.structs)}
${generateAliases(reflect.aliases)}
`;

  await fs.writeFile(outputPath, resultTs);
}

/**
 * @param { import('wgsl_reflect').StructInfo[] } structs
 */
const generateStructs = (structs) => `/* structs */
${structs
  .map(
    (struct) => `const ${struct.name} = d.struct({
  ${struct.members.map((member) => generateStructMember(member)).join('\n  ')}
});`,
  )
  .join('\n\n')}  
`;

/**
 * @param { import('wgsl_reflect').AliasInfo[] } aliases
 */
const generateAliases = (aliases) => `/* aliases */
${aliases
  .map(
    (alias) =>
      `const ${alias.name} = ${alias.type instanceof StructInfo ? '' : 'd.'}${replaceWithAlias(alias.type)};`,
  )
  .join('\n')}`;

/**
 * @param { import('wgsl_reflect').MemberInfo } member
 */
function generateStructMember(member) {
  if (member.type.size === 0) {
    throw new Error(`Invalid data type with size 0: ${member.type.name}`);
  }

  let type = `${member.type instanceof StructInfo ? '' : 'd.'}${replaceWithAlias(member.type)}`;

  for (const attribute of member.attributes ?? []) {
    if (['align', 'size'].includes(attribute.name)) {
      type = `d.${attribute.name}(${type}, ${attribute.value})`;
    }
  }

  return `${member.name}: ${type},`;
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

export default generate;
