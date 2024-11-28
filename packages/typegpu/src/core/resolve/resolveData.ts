import type {
  AnyWgslData,
  Bool,
  F32,
  I32,
  U32,
  Vec3f,
  WgslArray,
  WgslStruct,
} from '../../data/wgslTypes';
import { assertExhaustive } from '../../shared/utilityTypes';
import type { ResolutionCtx } from '../../types';

const identityTypes = ['bool', 'f32', 'i32', 'u32', 'vec3f'];
type IdentityType = Bool | F32 | I32 | U32 | Vec3f;

function isIdentityType(data: AnyWgslData): data is IdentityType {
  return identityTypes.includes(data.type);
}

function resolveStruct(ctx: ResolutionCtx, struct: WgslStruct) {
  const id = ctx.names.makeUnique(struct.label);

  ctx.addDeclaration(`
struct ${id} {
${Object.entries(struct.propTypes)
  .map(
    // TODO: Implement attributes
    // ([key, field]) => `  ${getAttributesString(field)}${key}: ${resolveData(ctx, field)},\n`;
    ([key, field]) => `  ${key}: ${resolveData(ctx, field as AnyWgslData)},\n`,
  )
  .join('')}\
}\n`);

  return id;
}

function resolveArray(ctx: ResolutionCtx, array: WgslArray) {
  const element = resolveData(ctx, array.elementType as AnyWgslData);

  return array.length === 0
    ? `array<${element}>`
    : `array<${element}, ${array.length}>`;
}

export function resolveData(ctx: ResolutionCtx, data: AnyWgslData): string {
  if (isIdentityType(data)) {
    return data.type;
  }

  if (data.type === 'struct') {
    return resolveStruct(ctx, data);
  }

  if (data.type === 'array') {
    return resolveArray(ctx, data);
  }

  assertExhaustive(data, 'resolveData');
}
