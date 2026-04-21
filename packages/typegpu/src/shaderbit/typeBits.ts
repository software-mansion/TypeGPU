// Decorated types don't exist on the level of type bits, they're a property of struct fields and function arguments instead,
// which simplifies their handling a lot in the type system.

export interface AttributeBit {
  readonly name: string;
  readonly params: (string | number)[][];
}

export interface StructPropertyBit<
  TType extends TypeBit = TypeBit,
  TAttribs extends AttributeBit[] = AttributeBit[],
> {
  readonly type: TType;
  readonly attribs: TAttribs;
}

export interface StructBit {
  readonly kind: 'struct';
  readonly fields: Record<string, StructPropertyBit>;
}

export interface ArrayBit {
  readonly kind: 'array';
  readonly elem: TypeBit;
  readonly count: number;
}

export interface PtrBit {
  readonly kind: 'ptr';
  readonly inner: TypeBit;
}

export type TypeBit =
  | 'abstractInt'
  | 'abstractFloat'
  | 'bool'
  | 'f32'
  | 'f16'
  | 'i32'
  | 'u32'
  | 'vec2f'
  | 'vec2h'
  | 'vec2i'
  | 'vec2u'
  | 'vec2b'
  | 'vec3f'
  | 'vec3h'
  | 'vec3i'
  | 'vec3u'
  | 'vec3b'
  | 'vec4f'
  | 'vec4h'
  | 'vec4i'
  | 'vec4u'
  | 'vec4b'
  | 'mat2x2f'
  | 'mat3x3f'
  | 'mat4x4f'
  | StructBit
  | ArrayBit
  | PtrBit;

export function isVectorType(type: TypeBit): boolean {
  return (
    type === 'vec2f' ||
    type === 'vec2h' ||
    type === 'vec2i' ||
    type === 'vec2u' ||
    type === 'vec2b' ||
    type === 'vec3f' ||
    type === 'vec3h' ||
    type === 'vec3i' ||
    type === 'vec3u' ||
    type === 'vec3b' ||
    type === 'vec4f' ||
    type === 'vec4h' ||
    type === 'vec4i' ||
    type === 'vec4u' ||
    type === 'vec4b'
  );
}

export function areTypesEqual(a: TypeBit, b: TypeBit): boolean {
  if (a === b) return true;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'struct') {
    return areStructTypesEqual(a as StructBit, b as StructBit);
  }
  if (a.kind === 'array') {
    const aArray = a as ArrayBit;
    const bArray = b as ArrayBit;
    return areTypesEqual(aArray.elem, bArray.elem) && aArray.count === bArray.count;
  }
  return false;
}

export function getVectorElementCount(type: TypeBit): number {
  switch (type) {
    case 'vec2f':
    case 'vec2h':
    case 'vec2i':
    case 'vec2u':
    case 'vec2b':
      return 2;
    case 'vec3f':
    case 'vec3h':
    case 'vec3i':
    case 'vec3u':
    case 'vec3b':
      return 3;
    case 'vec4f':
    case 'vec4h':
    case 'vec4i':
    case 'vec4u':
    case 'vec4b':
      return 4;
    default:
      return 1;
  }
  return 1;
}

export function isPtrType(type: unknown): type is PtrBit {
  return (type as PtrBit)?.kind === 'ptr';
}

export function isNumericType(
  type: unknown,
): type is 'abstractInt' | 'abstractFloat' | 'f32' | 'f16' | 'i32' | 'u32' {
  return (
    type === 'abstractInt' ||
    type === 'abstractFloat' ||
    type === 'f32' ||
    type === 'f16' ||
    type === 'i32' ||
    type === 'u32'
  );
}

export function getVectorPrimitive(
  type: TypeBit,
): 'f32' | 'f16' | 'i32' | 'u32' | 'bool' | undefined {
  switch (type) {
    case 'vec2f':
    case 'vec3f':
    case 'vec4f':
      return 'f32';
    case 'vec2h':
    case 'vec3h':
    case 'vec4h':
      return 'f16';
    case 'vec2i':
    case 'vec3i':
    case 'vec4i':
      return 'i32';
    case 'vec2u':
    case 'vec3u':
    case 'vec4u':
      return 'u32';
    case 'vec2b':
    case 'vec3b':
    case 'vec4b':
      return 'bool';
    default:
      return undefined;
  }
}

function areStructTypesEqual(a: StructBit, b: StructBit): boolean {
  if (Object.keys(a.fields).length !== Object.keys(b.fields).length) return false;
  for (const [name, aField] of Object.entries(a.fields)) {
    const bField = b.fields[name];
    // TODO: Compare attributes as well
    if (!bField || !areTypesEqual(aField.type, bField.type)) return false;
  }
  return true;
}
